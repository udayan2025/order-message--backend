import { BusinessAccount, BusinessCategory } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../config/database';

export class AccountService {
  public static async listAccounts(): Promise<BusinessAccount[]> {
    return prisma.businessAccount.findMany({
      include: {
        sessions: true,
        _count: {
          select: {
            catalog: true,
            contacts: true,
            orders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  public static async getAccountById(id: string): Promise<BusinessAccount | null> {
    return prisma.businessAccount.findUnique({
      where: { id },
      include: {
        sessions: true,
        catalog: true
      }
    });
  }

  public static async createAccount(data: {
    businessName: string;
    category?: BusinessCategory;
    categoryLabel?: string;
    ownerName?: string;
    phone?: string;
    email?: string;
    address?: string;
    currency?: string;
    workingHours?: string;
    greetingMessage?: string;
    aiPersonaPrompt?: string;
    minDelaySeconds?: number;
    maxDelaySeconds?: number;
    typingSimulation?: boolean;
    typingSpeedWpm?: number;
    enableAi?: boolean;
    enableStockQueries?: boolean;
    allowedChats?: string;
    webhookUrl?: string;
  }): Promise<BusinessAccount> {
    const category = data.category || 'custom';
    const cleanId = `biz_${data.businessName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${crypto.randomBytes(3).toString('hex')}`;
    const apiKey = `msgapi_live_${category.substring(0, 3)}_${crypto.randomBytes(6).toString('hex')}`;

    return prisma.businessAccount.create({
      data: {
        id: cleanId,
        businessName: data.businessName,
        category,
        categoryLabel: data.categoryLabel || `${data.businessName} Desk`,
        ownerName: data.ownerName || 'Store Owner',
        phone: data.phone || '+910000000000',
        email: data.email || null,
        address: data.address || null,
        currency: data.currency || '₹',
        workingHours: data.workingHours || '09:00 AM - 09:00 PM',
        greetingMessage: data.greetingMessage || `👋 Welcome to ${data.businessName}! How can we assist you today?`,
        aiPersonaPrompt: data.aiPersonaPrompt || `You are an AI assistant for ${data.businessName}. You answer customer questions politely and check stock.`,
        minDelaySeconds: data.minDelaySeconds ?? 8,
        maxDelaySeconds: data.maxDelaySeconds ?? 18,
        typingSimulation: data.typingSimulation ?? true,
        typingSpeedWpm: data.typingSpeedWpm ?? 60,
        enableAi: data.enableAi ?? true,
        enableStockQueries: data.enableStockQueries ?? true,
        allowedChats: data.allowedChats || '*',
        apiKey,
        webhookUrl: data.webhookUrl || null
      }
    });
  }

  public static async updateAccount(id: string, updates: Partial<BusinessAccount>): Promise<BusinessAccount> {
    return prisma.businessAccount.update({
      where: { id },
      data: updates
    });
  }

  public static async deleteAccount(id: string): Promise<void> {
    await prisma.businessAccount.delete({
      where: { id }
    });
  }

  public static async getAccountStats(id: string) {
    const [messagesCount, contactsCount, ordersCount, catalogCount] = await Promise.all([
      prisma.chatMessage.count({
        where: { contact: { businessId: id } }
      }),
      prisma.contact.count({
        where: { businessId: id }
      }),
      prisma.order.count({
        where: { businessId: id }
      }),
      prisma.catalogItem.count({
        where: { businessId: id }
      })
    ]);

    return {
      totalMessages: messagesCount,
      totalContacts: contactsCount,
      ordersPlaced: ordersCount,
      catalogItems: catalogCount
    };
  }
}
