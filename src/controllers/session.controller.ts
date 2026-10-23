import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { SessionService } from '../services/session.service';
import { setupSseHeaders, sendSseEvent } from '../utils/sse';
import { prisma } from '../config/database';

export class SessionController {
  public static async listSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const sessions = await SessionService.getInstance().listSessions(businessId);
      res.json({ success: true, sessions });
    } catch (err) {
      next(err);
    }
  }

  public static async createSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, sessionName, isPrimary } = req.body;
      const businessId = req.business?.id;

      if (!sessionId || !sessionName) {
        res.status(400).json({ success: false, error: 'sessionId and sessionName are required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const session = await SessionService.getInstance().initSession({
        sessionId,
        sessionName,
        businessId,
        isPrimary
      });

      const qrCode = SessionService.getInstance().getCachedQr(sessionId);

      res.status(201).json({
        success: true,
        sessionId: session.sessionId,
        status: session.status,
        qrCode,
        message: `Session created. Listen to /api/v1/sessions/${session.sessionId}/qr-stream for live QR code.`
      });
    } catch (err) {
      next(err);
    }
  }

  public static async streamQr(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      setupSseHeaders(res);

      const sessionManager = SessionService.getInstance();
      const existingSocket = sessionManager.getSocket(sessionId);

      // Auto-start Baileys socket if not already running so real WhatsApp Web QR is generated
      if (!existingSocket) {
        const dbSession = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } });
        let businessId = dbSession?.businessId;
        if (!businessId) {
          let business = await prisma.businessAccount.findFirst();
          if (!business) {
            business = await prisma.businessAccount.create({
              data: {
                id: 'msgapi_live_med_88921a99',
                businessName: 'Apollo Pharma Care',
                category: 'medicine',
                ownerName: 'Dr. Suresh Mehta',
                phone: '+919382468250',
                apiKey: 'msgapi_live_med_88921a99',
                currency: '₹',
                address: 'Apollo Medical Tower, Ring Road, Mumbai',
                workingHours: '8:00 AM - 11:00 PM',
                greetingMessage: 'Welcome to Apollo Pharma! Send a prescription photo or medicine name for instant delivery.',
                aiPersonaPrompt: 'You are an intelligent pharmacy assistant dispensing authentic medicines.'
              }
            });
          }
          businessId = business.id;
        }

        sessionManager.initSession({
          sessionId,
          sessionName: dbSession?.name || 'WhatsApp Device',
          businessId,
          isPrimary: dbSession?.isPrimary
        }).catch((err) => console.error('Failed to auto-init Baileys:', err));
      }

      const cachedQr = sessionManager.getCachedQr(sessionId);
      if (cachedQr) {
        sendSseEvent(res, 'qr', { qr: cachedQr, expireInSeconds: 30 });
      } else {
        sendSseEvent(res, 'connecting', { message: 'WhatsApp multi-device socket initializing...' });
      }

      const onQr = (data: any) => {
        sendSseEvent(res, 'qr', data);
      };

      const onStatus = (data: any) => {
        if (data.status === 'CONNECTED') {
          sendSseEvent(res, 'ready', data);
        } else if (data.status === 'DISCONNECTED') {
          sendSseEvent(res, 'disconnected', data);
        }
      };

      sessionManager.on(`qr:${sessionId}`, onQr);
      sessionManager.on(`status:${sessionId}`, onStatus);

      // Keep connection alive with periodic comment line
      const keepAliveInterval = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAliveInterval);
        sessionManager.off(`qr:${sessionId}`, onQr);
        sessionManager.off(`status:${sessionId}`, onStatus);
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getSessionStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await SessionService.getInstance().getSessionById(sessionId);

      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const cachedQr = SessionService.getInstance().getCachedQr(sessionId);

      res.json({
        success: true,
        session: {
          ...session,
          qrCode: cachedQr || session.qrCode
        }
      });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const deleteData = req.query.deleteData !== 'false';
      await SessionService.getInstance().deleteSession(sessionId, deleteData);
      res.json({ success: true, message: `Session ${sessionId} deleted successfully.` });
    } catch (err) {
      next(err);
    }
  }

  public static async disconnectSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      await SessionService.getInstance().disconnectOnlySession(sessionId);
      res.json({ success: true, message: `Session ${sessionId} disconnected successfully.` });
    } catch (err) {
      next(err);
    }
  }

  public static async requestPairingCode(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        res.status(400).json({ success: false, error: 'phoneNumber is required' });
        return;
      }
      const code = await SessionService.getInstance().requestPairingCode(sessionId, phoneNumber);
      res.json({ success: true, pairingCode: code });
    } catch (err) {
      next(err);
    }
  }

  public static async refreshQr(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      await SessionService.getInstance().refreshSessionQr(sessionId);
      const qrCode = SessionService.getInstance().getCachedQr(sessionId);
      res.json({ success: true, message: `QR refresh initiated for ${sessionId}`, qrCode });
    } catch (err) {
      next(err);
    }
  }
}
