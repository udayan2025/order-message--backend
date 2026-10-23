import { createApp } from './app';
import { connectDatabase, prisma, pgPool } from './config/database';
import { ENV } from './config/env';

async function bootstrap() {
  // 1. Establish PostgreSQL database connection
  await connectDatabase();

  // 2. Initialize Express application
  const app = createApp();

  // 3. Start HTTP server
  const server = app.listen(ENV.PORT, async () => {
    console.log(`
==========================================================
🚀 MessageAPI Server is running on port ${ENV.PORT}
📡 API Endpoint: http://localhost:${ENV.PORT}/api/v1
🧬 pgvector RAG: Active
🔒 Master Key:  ${ENV.API_SECRET_KEY}
==========================================================
    `);

    // Auto-restore existing active WhatsApp sessions on boot
    try {
      const activeSessions = await prisma.whatsAppSession.findMany({
        where: {
          status: 'CONNECTED'
        }
      });

      if (activeSessions.length > 0) {
        const { SessionService } = await import('./services/session.service');
        for (const session of activeSessions) {
          console.log(`⚡ Reconnecting saved WhatsApp session: ${session.id} (${session.name})...`);
          SessionService.getInstance().initSession({
            sessionId: session.id,
            sessionName: session.name,
            businessId: session.businessId,
            isPrimary: session.isPrimary
          }).catch((e) => console.log(`Session restore notice (${session.id}):`, e.message));
        }
      } else {
        console.log('ℹ️ No active WhatsApp sessions in database. Ready for new session pairing.');
      }
    } catch (e: any) {
      console.log('Session bootstrap notice:', e.message);
    }
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('\nGracefully shutting down MessageAPI server...');
    server.close(async () => {
      await prisma.$disconnect();
      await pgPool.end();
      console.log('✅ Connections closed. Goodbye!');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start MessageAPI server:', err);
  process.exit(1);
});
