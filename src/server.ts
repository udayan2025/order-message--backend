import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { connectDatabase, prisma, pgPool } from './config/database';
import { ENV } from './config/env';
import { LocationSessionService } from './services/location-session.service';

async function bootstrap() {
  // 1. Establish PostgreSQL database connection
  await connectDatabase();

  // 2. Initialize Express application & HTTP Server
  const app = createApp();
  const httpServer = http.createServer(app);

  // 3. Initialize Socket.IO Server for real-time location streaming
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    // Phone A or Phone B joins a private location session room
    socket.on('join-location-session', ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return;
      socket.join(`loc:${sessionId}`);
      const latest = LocationSessionService.getInstance().getLocation(sessionId);
      if (latest) {
        socket.emit('location-updated', latest);
      }
    });

    // Phone A emits continuous real-time GPS location updates
    socket.on('update-location', (data: any) => {
      if (!data || !data.sessionId || data.latitude === undefined || data.longitude === undefined) return;
      const updated = LocationSessionService.getInstance().updateLocation(data);
      // Real-time broadcast to Phone B (viewers in this session room)
      io.to(`loc:${data.sessionId}`).emit('location-updated', updated);
    });

    // Phone A stops live location sharing
    socket.on('stop-location-sharing', ({ sessionId }: { sessionId: string }) => {
      if (!sessionId) return;
      const stopped = LocationSessionService.getInstance().stopSharing(sessionId);
      io.to(`loc:${sessionId}`).emit('location-stopped', stopped);
    });
  });

  // 4. Start HTTP & WebSocket server
  const server = httpServer.listen(ENV.PORT, async () => {
    console.log(`
==========================================================
🚀 MessageAPI Server is running on port ${ENV.PORT}
📡 API Endpoint: http://localhost:${ENV.PORT}/api/v1
⚡ Real-time Socket.IO: Active (Location Sharing Engine)
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
    io.close();
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
