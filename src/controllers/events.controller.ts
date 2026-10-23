import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { EventsService } from '../services/events.service';
import { setupSseHeaders } from '../utils/sse';
import { prisma } from '../config/database';

export class EventsController {
  public static async streamEvents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      setupSseHeaders(res);

      let businessId = req.business?.id;
      const sessionId = req.query.sessionId as string;
      const apiKey = (req.query.apiKey as string) || (req.headers['x-api-key'] as string);

      if (!businessId && apiKey) {
        const business = await prisma.businessAccount.findUnique({
          where: { apiKey }
        });
        if (business) {
          businessId = business.id;
        }
      }

      if (!businessId && sessionId) {
        const session = await prisma.whatsAppSession.findUnique({
          where: { id: sessionId }
        });
        if (session) {
          businessId = session.businessId;
        }
      }

      if (!businessId) {
        const defaultBiz = await prisma.businessAccount.findFirst();
        if (defaultBiz) {
          businessId = defaultBiz.id;
        }
      }

      const unregister = EventsService.getInstance().registerClient(res, businessId, sessionId);

      req.on('close', () => {
        unregister();
      });
    } catch (err) {
      next(err);
    }
  }
}
