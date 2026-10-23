import { prisma } from '../config/database';
import { TemplateCategory, TemplateStatus, TemplateHeaderType } from '@prisma/client';

export interface InterpolatedTemplateResult {
  headerType: string;
  headerContent?: string;
  bodyText: string;
  footerText?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  fullFormattedText: string;
}

export class TemplateService {
  /**
   * Returns standard built-in templates covering product inquiry, order updates,
   * payment notifications, OTP verification, and booking reminders.
   */
  public static getDefaultTemplates(businessName: string) {
    return [
      {
        name: 'product_inquiry_catalog',
        displayName: 'Product Showcase & Email-Style Catalog Card',
        category: TemplateCategory.MARKETING,
        language: 'en_US',
        headerType: TemplateHeaderType.IMAGE,
        headerContent: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80',
        bodyText: `📦 *PRODUCT SPOTLIGHT: {{product_name}}*

Hello *{{customer_name}}*, thank you for inquiring with *{{business_name}}*! Here are the full specifications, verified stock, and exclusive pricing:

• 🏷️ *Brand:* {{brand}}
• 🔢 *SKU Code:* \`{{sku}}\`
• 📁 *Category:* {{category}}
• 💰 *Price:* *{{price}}* {{unit}}
• 📊 *Availability:* {{stock_status}}

📝 *Key Specifications & Details:*
{{description}}

───────────────
🛡️ *Customer Guarantee:*
✅ 100% Genuine Quality
⚡ Express Dispatch
🚚 Cash on Delivery (COD) & Instant QR Accepted

👉 Reply with *BUY {{sku}}* to order now!`,
        footerText: `Official catalog reply • ${businessName}`,
        buttons: [
          { type: 'QUICK_REPLY', text: 'BUY {{sku}}' },
          { type: 'QUICK_REPLY', text: 'Ask More Questions' }
        ],
        variables: [
          'product_name',
          'customer_name',
          'business_name',
          'brand',
          'sku',
          'category',
          'price',
          'unit',
          'stock_status',
          'description'
        ],
        sampleValues: {
          product_name: 'Bluetooth Headphones',
          customer_name: 'Valued Customer',
          business_name: businessName || 'TechHub Electronics',
          brand: 'Apple',
          sku: 'TECH-501',
          category: 'Audio & Headphones',
          price: '₹899.00',
          unit: '/ pcs',
          stock_status: '✅ In Stock (9 pcs ready)',
          description: 'Over-ear design, wireless acoustic drivers, noise isolation'
        },
        status: TemplateStatus.APPROVED,
        isDefault: true
      },
      {
        name: 'order_status_update',
        displayName: 'Order Confirmation & Dispatch Notice',
        category: TemplateCategory.UTILITY,
        language: 'en_US',
        headerType: TemplateHeaderType.TEXT,
        headerContent: 'ORDER CONFIRMED: #{{order_id}}',
        bodyText: `🎉 *Order Confirmed, {{customer_name}}!*

We have received your order *#{{order_id}}* at *{{business_name}}*.

📋 *Order Details:*
• *Item(s):* {{item_summary}}
• *Total Payable:* {{total_amount}}
• *Payment Mode:* {{payment_status}}
• *Shipping Address:* {{delivery_address}}

Our warehouse is packing your parcel for prompt dispatch. You will receive an update once it is out for delivery!`,
        footerText: `Thank you for choosing ${businessName}!`,
        buttons: [
          { type: 'QUICK_REPLY', text: 'Track Order' },
          { type: 'QUICK_REPLY', text: 'Contact Support' }
        ],
        variables: ['order_id', 'customer_name', 'business_name', 'item_summary', 'total_amount', 'payment_status', 'delivery_address'],
        sampleValues: {
          order_id: 'ORD-984210',
          customer_name: 'Wasim',
          business_name: businessName || 'TechHub Electronics',
          item_summary: '1x Bluetooth Headphones (TECH-501)',
          total_amount: '₹899.00',
          payment_status: 'Cash on Delivery (COD)',
          delivery_address: 'Central Park West, Tech Park, City'
        },
        status: TemplateStatus.APPROVED,
        isDefault: true
      },
      {
        name: 'payment_reminder',
        displayName: 'Payment Reminder & Invoice Notification',
        category: TemplateCategory.UTILITY,
        language: 'en_US',
        headerType: TemplateHeaderType.TEXT,
        headerContent: 'PAYMENT NOTIFICATION: {{invoice_no}}',
        bodyText: `Hello {{customer_name}}, this is a friendly reminder from *{{business_name}}* regarding your pending invoice *{{invoice_no}}* of *{{amount}}*.

Please settle the amount before *{{due_date}}* using UPI or Bank Transfer to complete your booking.`,
        footerText: `Automated billing reminder • ${businessName}`,
        buttons: [
          { type: 'QUICK_REPLY', text: 'I have already paid' },
          { type: 'QUICK_REPLY', text: 'Request UPI QR' }
        ],
        variables: ['customer_name', 'business_name', 'invoice_no', 'amount', 'due_date'],
        sampleValues: {
          customer_name: 'Customer',
          business_name: businessName || 'TechHub Electronics',
          invoice_no: 'INV-2026-08',
          amount: '₹1,499.00',
          due_date: 'Tomorrow, 5:00 PM'
        },
        status: TemplateStatus.APPROVED,
        isDefault: true
      },
      {
        name: 'account_verification_otp',
        displayName: 'Account OTP Verification',
        category: TemplateCategory.AUTHENTICATION,
        language: 'en_US',
        headerType: TemplateHeaderType.NONE,
        headerContent: null,
        bodyText: `*{{otp_code}}* is your one-time verification code for *{{business_name}}*. For your protection, do not share this password with anyone. Valid for 10 minutes.`,
        footerText: `Security Verification`,
        buttons: [
          { type: 'QUICK_REPLY', text: 'Copy Code' }
        ],
        variables: ['otp_code', 'business_name'],
        sampleValues: {
          otp_code: '489201',
          business_name: businessName || 'TechHub Electronics'
        },
        status: TemplateStatus.APPROVED,
        isDefault: true
      },
      {
        name: 'appointment_reminder',
        displayName: 'Appointment & Consultation Schedule',
        category: TemplateCategory.UTILITY,
        language: 'en_US',
        headerType: TemplateHeaderType.TEXT,
        headerContent: 'APPOINTMENT SCHEDULED',
        bodyText: `Hello *{{customer_name}}*, your appointment at *{{business_name}}* is scheduled for *{{appointment_time}}*.

📍 *Address:* {{location}}
👨‍💼 *Consultant / Desk:* {{specialist_name}}

Please arrive 5-10 minutes prior to your time slot.`,
        footerText: `Reply RESCHEDULE if you need to alter time`,
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirm Slot' },
          { type: 'QUICK_REPLY', text: 'Reschedule' }
        ],
        variables: ['customer_name', 'business_name', 'appointment_time', 'location', 'specialist_name'],
        sampleValues: {
          customer_name: 'Customer',
          business_name: businessName || 'TechHub Electronics',
          appointment_time: 'Tomorrow at 11:30 AM',
          location: 'Floor 2, Customer Experience Center',
          specialist_name: 'Service Lead'
        },
        status: TemplateStatus.APPROVED,
        isDefault: true
      }
    ];
  }

  /**
   * Automatically initializes default templates for a business account if none exist yet.
   */
  public static async ensureDefaultTemplates(businessId: string): Promise<void> {
    const count = await prisma.whatsAppTemplate.count({
      where: { businessId }
    });

    if (count > 0) return;

    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    });

    const defaults = this.getDefaultTemplates(business?.businessName || 'Business');

    for (const item of defaults) {
      await prisma.whatsAppTemplate.upsert({
        where: {
          businessId_name: {
            businessId,
            name: item.name
          }
        },
        update: {},
        create: {
          businessId,
          name: item.name,
          displayName: item.displayName,
          category: item.category,
          language: item.language,
          headerType: item.headerType,
          headerContent: item.headerContent,
          bodyText: item.bodyText,
          footerText: item.footerText,
          buttons: item.buttons as any,
          variables: item.variables as any,
          sampleValues: item.sampleValues as any,
          status: item.status,
          isDefault: true
        }
      });
    }
  }

  /**
   * Retrieves all templates for a business account.
   */
  public static async listTemplates(businessId: string) {
    await this.ensureDefaultTemplates(businessId);
    return prisma.whatsAppTemplate.findMany({
      where: { businessId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
  }

  /**
   * Creates a new custom template.
   */
  public static async createTemplate(businessId: string, data: any) {
    const rawName = (data.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);

    const name = rawName || `template_${Date.now()}`;

    // Extract variables from body text (e.g. {{variable_name}} or {{1}})
    const matches = Array.from((data.bodyText || '').matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g));
    const variables = Array.from(new Set(matches.map((m: any) => m[1])));

    return prisma.whatsAppTemplate.create({
      data: {
        businessId,
        name,
        displayName: data.displayName || name,
        category: data.category || TemplateCategory.MARKETING,
        language: data.language || 'en_US',
        headerType: data.headerType || TemplateHeaderType.NONE,
        headerContent: data.headerContent || null,
        bodyText: data.bodyText || '',
        footerText: data.footerText || null,
        buttons: data.buttons || null,
        variables: variables as any,
        sampleValues: data.sampleValues || {},
        status: TemplateStatus.APPROVED, // Default approved for internal gateway simulation
        metaTemplateId: data.metaTemplateId || `meta_${Date.now()}`,
        isDefault: false
      }
    });
  }

  /**
   * Updates an existing template.
   */
  public static async updateTemplate(id: string, businessId: string, data: any) {
    const matches = Array.from((data.bodyText || '').matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g));
    const variables = Array.from(new Set(matches.map((m: any) => m[1])));

    return prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        displayName: data.displayName,
        category: data.category,
        language: data.language,
        headerType: data.headerType,
        headerContent: data.headerContent,
        bodyText: data.bodyText,
        footerText: data.footerText,
        buttons: data.buttons,
        variables: variables as any,
        sampleValues: data.sampleValues,
        status: data.status || TemplateStatus.APPROVED
      }
    });
  }

  /**
   * Deletes a template.
   */
  public static async deleteTemplate(id: string, businessId: string) {
    return prisma.whatsAppTemplate.delete({
      where: { id }
    });
  }

  /**
   * Simulates or calls Meta Cloud API to approve a template.
   */
  public static async approveTemplate(id: string, businessId: string) {
    return prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        status: TemplateStatus.APPROVED,
        metaTemplateId: `meta_appr_${Date.now()}`
      }
    });
  }

  /**
   * Replaces dynamic variables {{key}} in bodyText, header, footer, and buttons.
   */
  public static interpolateTemplate(template: any, values: Record<string, any> = {}): InterpolatedTemplateResult {
    const replaceVars = (text: string): string => {
      if (!text) return '';
      return text.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, key) => {
        if (values[key] !== undefined && values[key] !== null) {
          return String(values[key]);
        }
        if (template.sampleValues && template.sampleValues[key] !== undefined) {
          return String(template.sampleValues[key]);
        }
        return `[${key}]`;
      });
    };

    const headerContent = template.headerContent ? replaceVars(template.headerContent) : undefined;
    const bodyText = replaceVars(template.bodyText || '');
    const footerText = template.footerText ? replaceVars(template.footerText) : undefined;

    let buttons: any[] = [];
    if (Array.isArray(template.buttons)) {
      buttons = template.buttons.map((b: any) => ({
        ...b,
        text: replaceVars(b.text || ''),
        url: b.url ? replaceVars(b.url) : undefined
      }));
    }

    // Assemble full WhatsApp formatted message
    const parts: string[] = [];
    if (headerContent && template.headerType === 'TEXT') {
      parts.push(`*${headerContent}*\n`);
    }
    parts.push(bodyText);
    if (footerText) {
      parts.push(`\n_${footerText}_`);
    }

    return {
      headerType: template.headerType,
      headerContent,
      bodyText,
      footerText,
      buttons,
      fullFormattedText: parts.join('\n')
    };
  }

  /**
   * Sends a populated template to a WhatsApp contact via MessageService.
   */
  public static async sendTemplate(params: {
    businessId: string;
    templateId: string;
    phone: string;
    variables?: Record<string, any>;
  }) {
    const { businessId, templateId, phone, variables = {} } = params;

    const template = await prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, businessId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const business = await prisma.businessAccount.findUnique({
      where: { id: businessId }
    });

    const mergedVariables = {
      business_name: business?.businessName || 'Business',
      ...variables
    };

    const interpolated = this.interpolateTemplate(template, mergedVariables);

    const { MessageService } = await import('./message.service');

    let effectiveMessageType: 'text' | 'image' | 'document' = 'text';
    let mediaUrl: string | undefined = undefined;

    if (template.headerType === 'IMAGE' && interpolated.headerContent) {
      effectiveMessageType = 'image';
      mediaUrl = interpolated.headerContent;
    } else if (template.headerType === 'DOCUMENT' && interpolated.headerContent) {
      effectiveMessageType = 'document';
      mediaUrl = interpolated.headerContent;
    }

    const activeSession = await prisma.whatsAppSession.findFirst({
      where: { businessId, status: 'CONNECTED' },
      orderBy: { updatedAt: 'desc' }
    }) || await prisma.whatsAppSession.findFirst({
      where: { businessId },
      orderBy: { updatedAt: 'desc' }
    });

    if (!activeSession) {
      throw new Error('No WhatsApp session found for this business. Please connect WhatsApp first.');
    }

    return MessageService.sendMessage({
      businessId,
      sessionId: activeSession.id,
      to: phone,
      content: interpolated.fullFormattedText,
      messageType: effectiveMessageType,
      mediaUrl
    });
  }
}
