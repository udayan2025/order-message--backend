import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { ENV } from './env';

// Prisma Client instance
export const prisma = new PrismaClient({
  log: ENV.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

// Dedicated PostgreSQL Pool for pgvector and raw vector operations
export const pgPool = new Pool({
  connectionString: ENV.DATABASE_URL
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('📦 PostgreSQL Connected successfully via Prisma.');

    // Test pgvector extension availability if available
    const client = await pgPool.connect();
    try {
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('🧬 pgvector extension verified / initialized successfully.');
      } catch {
        console.log('ℹ️ Running in universal PostgreSQL vector mode (native array embeddings).');
      }

      // Automatically migrate users table & domain/password/isPinned columns if not present
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            domain TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            "businessId" TEXT UNIQUE NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS domain TEXT UNIQUE;
          ALTER TABLE business_accounts ADD COLUMN IF NOT EXISTS password TEXT;
          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "pinnedMessageId" TEXT;
        `);
        console.log('🔐 User auth, domain, and message isPinned schema verified / updated.');

        // Regenerate Prisma Client in background if needed (development only)
        if (ENV.NODE_ENV !== 'production') {
          try {
            const { exec } = await import('child_process');
            exec('npx prisma generate', (err) => {
              if (!err) console.log('✨ Prisma Client regenerated with isPinned & pinnedMessageId.');
            });
          } catch {}
        }
      } catch (err: any) {
        console.warn('⚠️ User auth migration notice:', err.message);
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('⚠️ Database connection notice:', err.message);
    console.warn('ℹ️ If PostgreSQL is not currently running, run `docker compose up -d` in /server');
  }
}
