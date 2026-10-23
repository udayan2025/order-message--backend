import { Response } from 'express';
import { sendSseEvent } from '../utils/sse';

export class EventsService {
  private static instance: EventsService;
  private clients: Set<{ res: Response; businessId?: string; sessionId?: string }> = new Set();

  private constructor() {}

  public static getInstance(): EventsService {
    if (!EventsService.instance) {
      EventsService.instance = new EventsService();
    }
    return EventsService.instance;
  }

  public registerClient(res: Response, businessId?: string, sessionId?: string): () => void {
    const client = { res, businessId, sessionId };
    this.clients.add(client);

    // Send initial handshake
    sendSseEvent(res, 'INIT', { status: 'CONNECTED', timestamp: Date.now() });

    return () => {
      this.clients.delete(client);
    };
  }

  public broadcast(type: string, data: any, filter?: { businessId?: string; sessionId?: string }): void {
    for (const client of this.clients) {
      if (filter?.sessionId && client.sessionId && client.sessionId !== filter.sessionId) {
        continue;
      }
      if (filter?.businessId && client.businessId && client.businessId !== filter.businessId) {
        if (!client.sessionId || client.sessionId !== filter?.sessionId) {
          continue;
        }
      }

      try {
        sendSseEvent(client.res, type, { type, ...data });
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }
}
