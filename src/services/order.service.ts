import { prisma } from '../config/database';
import { EventsService } from './events.service';
import { OrderStatus, PaymentStatus, MessageSender, MessageType, MessageStatus } from '@prisma/client';

export interface CreateOrderItemInput {
  productId?: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  imageUrl?: string;
}

export interface CreateOrderParams {
  businessId: string;
  contactId: string;
  items: CreateOrderItemInput[];
  deliveryAddress?: string;
  paymentStatus?: 'UNPAID' | 'PAID' | 'COD';
  notes?: string;
  customerName?: string;
  customerPhone?: string;
}

export class OrderService {
  /**
   * Creates a new customer order transactionally, deducting catalog stock,
   * recording the Order record, generating order confirmation message, and broadcasting via SSE.
   */
  public static async createOrder(params: CreateOrderParams) {
    const {
      businessId,
      contactId,
      items,
      deliveryAddress,
      paymentStatus = 'COD',
      notes,
      customerName,
      customerPhone
    } = params;

    if (!items || items.length === 0) {
      throw new Error('At least one catalog item is required to place an order.');
    }

    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    });
    if (!business) {
      throw new Error('Business account not found');
    }

    // Ensure contact exists or create if missing
    let contact = contactId ? await prisma.contact.findFirst({
      where: { id: contactId, businessId }
    }) : null;

    if (!contact && customerPhone) {
      contact = await prisma.contact.upsert({
        where: {
          businessId_phone: {
            businessId,
            phone: customerPhone
          }
        },
        update: {
          name: customerName || undefined
        },
        create: {
          businessId,
          phone: customerPhone,
          name: customerName || `Customer ${customerPhone.slice(-4)}`,
          tag: 'Direct Buyer'
        }
      });
    }

    if (!contact) {
      throw new Error('Contact recipient could not be found or resolved for order placement.');
    }

    // Calculate total amount
    const totalAmount = items.reduce((acc, item) => {
      const q = Math.max(1, item.quantity || 1);
      const p = Math.max(0, Number(item.price) || 0);
      return acc + p * q;
    }, 0);

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const currency = business.currency || '₹';

    // Execute Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct stock for each catalog item in the order
      for (const item of items) {
        if (item.productId) {
          const catItem = await tx.catalogItem.findUnique({
            where: { id: item.productId }
          });
          if (catItem) {
            const newStock = Math.max(0, catItem.stock - (item.quantity || 1));
            await tx.catalogItem.update({
              where: { id: item.productId },
              data: {
                stock: newStock,
                isAvailable: newStock > 0
              }
            });
          }
        } else if (item.sku) {
          const catItem = await tx.catalogItem.findFirst({
            where: { businessId, sku: item.sku }
          });
          if (catItem) {
            const newStock = Math.max(0, catItem.stock - (item.quantity || 1));
            await tx.catalogItem.update({
              where: { id: catItem.id },
              data: {
                stock: newStock,
                isAvailable: newStock > 0
              }
            });
          }
        }
      }

      // 2. Map PaymentStatus Enum safely
      let resolvedPayment: PaymentStatus = PaymentStatus.COD;
      if (paymentStatus === 'PAID') resolvedPayment = PaymentStatus.PAID;
      else if (paymentStatus === 'UNPAID') resolvedPayment = PaymentStatus.UNPAID;

      // 3. Create Order
      const newOrder = await tx.order.create({
        data: {
          businessId,
          contactId: contact.id,
          orderNumber,
          totalAmount,
          items: items as any,
          deliveryAddress: deliveryAddress || null,
          status: OrderStatus.CONFIRMED,
          paymentStatus: resolvedPayment,
          notes: notes || null
        }
      });

      // 4. Create confirmation ChatMessage in database
      const itemsListText = items
        .map((i) => `• *${i.quantity}x ${i.name}* (\`${i.sku}\`) - ${currency}${(i.price * i.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`)
        .join('\n');

      const confirmationText = `🎉 *Order Successfully Placed!*

📋 *Order ID:* \`${orderNumber}\`
───────────────
${itemsListText}
───────────────
💰 *Total Amount:* *${currency}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*
💳 *Payment Method:* ${resolvedPayment === PaymentStatus.COD ? 'Cash on Delivery (COD)' : resolvedPayment}
📍 *Delivery Address:* ${deliveryAddress || 'Store Pickup / Counter'}
${notes ? `📝 *Notes:* ${notes}\n` : ''}
Thank you for purchasing with *${business.businessName}*! We are preparing your order for prompt dispatch.`;

      const botMessage = await tx.chatMessage.create({
        data: {
          contactId: contact.id,
          sender: MessageSender.business,
          text: confirmationText,
          messageType: MessageType.TEXT,
          isAiGenerated: true,
          status: MessageStatus.SENT
        }
      });

      return { newOrder, botMessage, confirmationText };
    });

    // 5. Broadcast to SSE clients for instant live UI update across all active browser tabs
    const eventsService = EventsService.getInstance();
    eventsService.broadcast('order:new', {
      order: result.newOrder,
      businessId,
      contactId: contact.id
    }, { businessId });

    eventsService.broadcast('message:new', {
      contactId: contact.id,
      message: {
        id: result.botMessage.id,
        sender: 'business',
        text: result.confirmationText,
        messageType: 'text',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAiGenerated: true,
        status: 'sent'
      }
    }, { businessId });

    // Also broadcast catalog refresh signal so tables and valuation cards update
    eventsService.broadcast('catalog:updated', { businessId }, { businessId });

    return result.newOrder;
  }

  /**
   * Retrieves orders for a business account with pagination and status filters
   */
  public static async getOrders(params: {
    businessId: string;
    limit?: number;
    offset?: number;
    status?: OrderStatus;
  }) {
    const { businessId, limit = 50, offset = 0, status } = params;

    const where: any = { businessId };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.order.count({ where })
    ]);

    return { orders, total };
  }

  /**
   * Updates an order's status or payment status
   */
  public static async updateOrderStatus(params: {
    orderId: string;
    businessId: string;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
  }) {
    const { orderId, businessId, status, paymentStatus } = params;

    const data: any = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;

    const updated = await prisma.order.update({
      where: { id: orderId, businessId },
      data
    });

    EventsService.getInstance().broadcast('order:updated', { order: updated }, { businessId });
    return updated;
  }
}
