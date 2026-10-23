import { generateHmacSignature } from '../utils/hmac';
import { ENV } from '../config/env';

export class WebhookService {
  public static async dispatchInboundMessage(params: {
    webhookUrl: string;
    webhookSecret?: string | null;
    businessId: string;
    sessionId: string;
    from: string;
    senderName?: string;
    messageId: string;
    text: string;
  }): Promise<boolean> {
    const { webhookUrl, webhookSecret, businessId, sessionId, from, senderName, messageId, text } = params;

    if (!webhookUrl) return false;

    const payload = {
      event: 'message.received',
      businessId,
      sessionId,
      from,
      senderName: senderName || 'Customer',
      messageId,
      timestamp: Math.floor(Date.now() / 1000),
      message: {
        type: 'text',
        text
      }
    };

    const signature = generateHmacSignature(payload, webhookSecret || ENV.API_SECRET_KEY);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-messageapi-signature': signature
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (err: any) {
      console.warn(`[Webhook] Failed to deliver event to ${webhookUrl}:`, err.message);
      return false;
    }
  }
}
