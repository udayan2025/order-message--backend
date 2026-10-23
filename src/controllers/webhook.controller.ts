import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { WebhookService } from '../services/webhook.service';

export class WebhookController {
  public static async simulateInbound(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { from, text, sessionId } = req.body;
      const business = req.business;

      if (!from || !text) {
        res.status(400).json({ success: false, error: 'from and text are required' });
        return;
      }

      if (!business?.webhookUrl) {
        res.status(400).json({ success: false, error: 'Business account has no webhookUrl configured' });
        return;
      }

      const delivered = await WebhookService.dispatchInboundMessage({
        webhookUrl: business.webhookUrl,
        webhookSecret: business.webhookSecret,
        businessId: business.id,
        sessionId: sessionId || 'wa_primary_01',
        from,
        messageId: `sim_${Date.now()}`,
        text
      });

      res.json({ success: true, delivered, webhookUrl: business.webhookUrl });
    } catch (err) {
      next(err);
    }
  }
}
