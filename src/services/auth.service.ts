import crypto from 'crypto';
import { prisma, pgPool } from '../config/database';
import { BusinessAccount, BusinessCategory } from '@prisma/client';
import { RagService } from './rag.service';

export interface RegisterInput {
  domain: string;
  password: string;
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
}

export interface UserRecord {
  id: string;
  domain: string;
  businessId: string;
  createdAt: Date;
}

// No default catalog seeding: newly registered business starts with 0 items

export class AuthService {
  /**
   * Helper: Normalize domain name into standard format
   */
  public static cleanDomain(domain: string): string {
    return (domain || '')
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/[^a-z0-9.-]/g, '');
  }

  /**
   * Helper: Hash password securely
   */
  public static hashPassword(password: string): string {
    const salt = 'msgapi_secure_salt_2026';
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
  }

  /**
   * Helper: Format database account record into client-ready BusinessAccount object
   */
  public static formatAccount(account: any, domain?: string): any {
    if (!account) return null;
    return {
      id: account.id,
      domain: domain || account.domain || '',
      businessName: account.businessName || account.name || 'Business',
      category: account.category || 'custom',
      categoryLabel: account.categoryLabel || `${account.businessName || 'Store'} Desk`,
      ownerName: account.ownerName || 'Store Owner',
      phone: account.phone || '+91 99999 00000',
      email: account.email || '',
      address: account.address || '',
      currency: account.currency || '₹',
      workingHours: account.workingHours || '08:00 AM - 10:00 PM',
      greetingMessage: account.greetingMessage || '👋 Welcome to our store!',
      aiPersonaPrompt: account.aiPersonaPrompt || 'You are an intelligent store assistant.',
      antiBanDelay: {
        min: account.minDelaySeconds || 8,
        max: account.maxDelaySeconds || 18,
        typingSimulation: account.typingSimulation !== false,
        typingSpeedWpm: account.typingSpeedWpm || 60
      },
      enableAi: account.enableAi !== false,
      enableStockQueries: account.enableStockQueries !== false,
      allowedChats: account.allowedChats || '*',
      apiKey: account.apiKey,
      webhookUrl: account.webhookUrl || '',
      status: account.sessions?.some((s: any) => s.status === 'CONNECTED') ? 'connected' : 'qr_ready',
      phoneNumber: account.phone || '',
      catalog: account.catalog || [],
      createdAt: account.createdAt ? new Date(account.createdAt).toISOString() : new Date().toISOString(),
      stats: {
        totalMessages: 0,
        inboundQueries: 0,
        ordersPlaced: 0,
        stockInquiries: 0
      }
    };
  }

  /**
   * Register a new user and business account
   */
  public static async register(input: RegisterInput): Promise<{
    user: UserRecord;
    account: BusinessAccount;
    apiKey: string;
  }> {
    const cleanDomain = AuthService.cleanDomain(input.domain);
    if (!cleanDomain || cleanDomain.length < 3) {
      throw new Error('Valid company domain name is required (at least 3 characters, e.g. apollo.com or ironfit)');
    }

    if (!input.password || input.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    if (!input.businessName || input.businessName.trim().length === 0) {
      throw new Error('Business / Store Name is required');
    }

    // Check if domain already exists
    const existingUser = await pgPool.query('SELECT id FROM users WHERE domain = $1 LIMIT 1', [cleanDomain]);
    if (existingUser.rows.length > 0) {
      throw new Error(`Domain "${cleanDomain}" is already registered. Please log in with your credentials.`);
    }

    const existingBiz = await pgPool.query('SELECT id FROM business_accounts WHERE domain = $1 LIMIT 1', [cleanDomain]);
    if (existingBiz.rows.length > 0) {
      throw new Error(`Domain "${cleanDomain}" is already in use. Please choose another domain.`);
    }

    const category = (input.category || 'custom') as BusinessCategory;
    const businessId = `biz_${cleanDomain.replace(/[^a-z0-9]/g, '_')}_${crypto.randomBytes(3).toString('hex')}`;
    const apiKey = `msgapi_live_${category.slice(0, 3)}_${cleanDomain.replace(/[^a-z0-9]/g, '_').slice(0, 8)}_${crypto.randomBytes(4).toString('hex')}`;
    const hashedPassword = AuthService.hashPassword(input.password);
    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;

    // Create Business Account in PostgreSQL
    const account = await prisma.businessAccount.create({
      data: {
        id: businessId,
        businessName: input.businessName.trim(),
        category,
        categoryLabel: input.categoryLabel || `${input.businessName} Desk`,
        ownerName: input.ownerName || 'Store Owner',
        phone: input.phone || '+91 99999 00000',
        email: input.email || null,
        address: input.address || null,
        currency: input.currency || '₹',
        workingHours: input.workingHours || '08:00 AM - 10:00 PM',
        greetingMessage: input.greetingMessage || `👋 Welcome to ${input.businessName}! How can we assist you today?`,
        aiPersonaPrompt: input.aiPersonaPrompt || `You are an intelligent, empathetic WhatsApp assistant for ${input.businessName}. You answer customer questions politely and check catalog stock.`,
        minDelaySeconds: 8,
        maxDelaySeconds: 18,
        typingSimulation: true,
        typingSpeedWpm: 60,
        enableAi: true,
        enableStockQueries: true,
        allowedChats: '*',
        apiKey
      }
    });

    // Update domain & password in business_accounts table
    await pgPool.query(
      'UPDATE business_accounts SET domain = $1, password = $2 WHERE id = $3',
      [cleanDomain, hashedPassword, businessId]
    );

    // Insert user record in users table
    const userRes = await pgPool.query(
      `INSERT INTO users (id, domain, password, "businessId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, domain, "businessId", "createdAt"`,
      [userId, cleanDomain, hashedPassword, businessId]
    );

    const user: UserRecord = {
      id: userRes.rows[0].id,
      domain: userRes.rows[0].domain,
      businessId: userRes.rows[0].businessId,
      createdAt: userRes.rows[0].createdAt
    };

    // Zero items seeded on registration - live catalog starts completely clean

    console.log(`👤 New user registered: domain="${cleanDomain}", business="${input.businessName}" (${businessId})`);

    return {
      user,
      account: AuthService.formatAccount(account, cleanDomain),
      apiKey
    };
  }

  /**
   * Log in user using domain and password
   */
  public static async login(credentials: {
    domain: string;
    password: string;
  }): Promise<{
    user: UserRecord;
    account: BusinessAccount;
    apiKey: string;
  }> {
    const cleanDomain = AuthService.cleanDomain(credentials.domain);
    if (!cleanDomain) {
      throw new Error('Please enter your company domain name');
    }
    if (!credentials.password) {
      throw new Error('Please enter your password');
    }

    // 1. Lookup user in users table
    let userRow = (await pgPool.query('SELECT * FROM users WHERE domain = $1 LIMIT 1', [cleanDomain])).rows[0];

    // If not in users, check business_accounts by domain
    if (!userRow) {
      const bizRow = (await pgPool.query('SELECT * FROM business_accounts WHERE domain = $1 LIMIT 1', [cleanDomain])).rows[0];
      if (bizRow) {
        userRow = {
          id: `usr_${bizRow.id}`,
          domain: bizRow.domain || cleanDomain,
          password: bizRow.password,
          businessId: bizRow.id,
          createdAt: bizRow.createdAt
        };
        // Auto-sync into users table
        await pgPool.query(
          `INSERT INTO users (id, domain, password, "businessId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (domain) DO NOTHING`,
          [userRow.id, userRow.domain, userRow.password || '', userRow.businessId]
        ).catch(() => null);
      }
    }

    if (!userRow) {
      throw new Error(`No account found for domain "${cleanDomain}". Please verify your company domain or register a new account.`);
    }

    // Verify password
    const hashed = AuthService.hashPassword(credentials.password);
    if (userRow.password && userRow.password !== hashed) {
      throw new Error('Incorrect password. Please try again.');
    }

    // Fetch the associated business account
    const account = await prisma.businessAccount.findUnique({
      where: { id: userRow.businessId },
      include: {
        sessions: true
      }
    });

    if (!account) {
      throw new Error(`Business data for domain "${cleanDomain}" could not be located.`);
    }

    return {
      user: {
        id: userRow.id,
        domain: userRow.domain,
        businessId: userRow.businessId,
        createdAt: userRow.createdAt
      },
      account: AuthService.formatAccount(account, cleanDomain),
      apiKey: account.apiKey
    };
  }

  /**
   * Update user password
   */
  public static async updatePassword(params: {
    domain?: string;
    businessId?: string;
    currentPassword?: string;
    newPassword: string;
  }): Promise<void> {
    const { domain, businessId, currentPassword, newPassword } = params;

    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long');
    }

    let userRow: any = null;
    if (domain) {
      const clean = AuthService.cleanDomain(domain);
      userRow = (await pgPool.query('SELECT * FROM users WHERE domain = $1 LIMIT 1', [clean])).rows[0];
    } else if (businessId) {
      userRow = (await pgPool.query('SELECT * FROM users WHERE "businessId" = $1 LIMIT 1', [businessId])).rows[0];
    }

    if (!userRow) {
      throw new Error('User record not found to update password');
    }

    // If current password provided, verify it
    if (currentPassword && userRow.password) {
      const hashedCurrent = AuthService.hashPassword(currentPassword);
      if (userRow.password !== hashedCurrent) {
        throw new Error('Current password is incorrect');
      }
    }

    const hashedNew = AuthService.hashPassword(newPassword);

    await pgPool.query(
      'UPDATE users SET password = $1, "updatedAt" = NOW() WHERE id = $2',
      [hashedNew, userRow.id]
    );

    if (userRow.businessId) {
      await pgPool.query(
        'UPDATE business_accounts SET password = $1, "updatedAt" = NOW() WHERE id = $2',
        [hashedNew, userRow.businessId]
      );
    }
  }

  /**
   * Get user and business account by apiKey or domain
   */
  public static async getMe(identifier: string): Promise<{
    user: UserRecord | null;
    account: BusinessAccount | null;
  }> {
    const clean = AuthService.cleanDomain(identifier);

    // Try finding by apiKey or id
    let account = await prisma.businessAccount.findFirst({
      where: {
        OR: [
          { apiKey: identifier },
          { id: identifier }
        ]
      },
      include: {
        sessions: true,
        catalog: true
      }
    });

    if (!account && clean) {
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT b.id FROM business_accounts b 
           LEFT JOIN users u ON u."businessId" = b.id 
           WHERE b.domain = $1 OR u.domain = $1 
           LIMIT 1`,
          clean
        );
        if (rows && rows.length > 0 && rows[0].id) {
          account = await prisma.businessAccount.findUnique({
            where: { id: rows[0].id },
            include: {
              sessions: true,
              catalog: true
            }
          });
        }
      } catch (err) {}
    }

    if (!account) return { user: null, account: null };

    const userRow = (await pgPool.query('SELECT * FROM users WHERE "businessId" = $1 LIMIT 1', [account.id])).rows[0];

    return {
      user: userRow
        ? {
            id: userRow.id,
            domain: userRow.domain,
            businessId: userRow.businessId,
            createdAt: userRow.createdAt
          }
        : null,
      account: AuthService.formatAccount(account, userRow?.domain || (account as any).domain || clean)
    };
  }
}
