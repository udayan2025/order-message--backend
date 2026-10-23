import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { MessageService } from '../services/message.service';

export class MessageController {
  public static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, to, content, messageType, mediaUrl, antiBanPacing, simulateTyping } = req.body;
      const businessId = req.business?.id;

      if (!sessionId || !to || !content) {
        res.status(400).json({ success: false, error: 'sessionId, to, and content are required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await MessageService.sendMessage({
        businessId,
        sessionId,
        to,
        content,
        messageType,
        mediaUrl,
        antiBanPacing,
        simulateTyping
      });

      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async sendMedia(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, to, messageType, mediaUrl, caption } = req.body;
      const businessId = req.business?.id;

      if (!sessionId || !to || !mediaUrl || !messageType) {
        res.status(400).json({ success: false, error: 'sessionId, to, messageType, and mediaUrl are required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await MessageService.sendMessage({
        businessId,
        sessionId,
        to,
        content: caption || '',
        messageType,
        mediaUrl
      });

      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async sendLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, to, latitude, longitude, name, address, isLive, accuracy, speed } = req.body;
      const businessId = req.business?.id;

      if (!sessionId || !to || latitude === undefined || longitude === undefined) {
        res.status(400).json({ success: false, error: 'sessionId, to, latitude, and longitude are required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await MessageService.sendLocation({
        businessId,
        sessionId,
        to,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        name: name ? String(name) : 'Shared Location',
        address: address ? String(address) : '',
        isLive: Boolean(isLive),
        accuracy: accuracy !== undefined ? parseFloat(accuracy) : 10,
        speed: speed !== undefined ? parseFloat(speed) : 0
      });

      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async getLatestLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contactId } = req.params;
      const businessId = req.business?.id;
      if (!businessId || !contactId) {
        res.status(400).json({ success: false, error: 'businessId and contactId are required' });
        return;
      }
      const result = await MessageService.getLatestContactLocation(businessId, contactId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async getContacts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const sessionId = req.query.sessionId as string | undefined;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const contacts = await MessageService.getContacts(businessId, sessionId);
      res.json({ success: true, contacts });
    } catch (err) {
      next(err);
    }
  }

  public static async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contactId } = req.params;
      const messages = await MessageService.getContactMessages(contactId);
      res.json({ success: true, messages });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteContact(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { contactId } = req.params;
      if (!businessId || !contactId) {
        res.status(400).json({ success: false, error: 'businessId and contactId are required' });
        return;
      }
      const result = await MessageService.deleteContact(businessId, contactId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async deleteMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { messageIds } = req.body;
      if (!businessId || !Array.isArray(messageIds) || messageIds.length === 0) {
        res.status(400).json({ success: false, error: 'messageIds array is required' });
        return;
      }
      const result = await MessageService.deleteMessages(businessId, messageIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async togglePinMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { contactId, messageId, isPinned } = req.body;
      if (!businessId || !contactId || !messageId) {
        res.status(400).json({ success: false, error: 'contactId and messageId are required' });
        return;
      }
      const result = await MessageService.togglePinMessage({
        businessId,
        contactId,
        messageId,
        isPinned
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async simulateInbound(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { contactId, text } = req.body;

      if (!businessId || !contactId || !text) {
        res.status(400).json({ success: false, error: 'contactId and text are required.' });
        return;
      }

      const result = await MessageService.simulateInbound({
        businessId,
        contactId,
        text
      });

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
}
