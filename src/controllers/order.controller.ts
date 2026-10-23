import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { OrderService } from '../services/order.service';

export class OrderController {
  public static async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Business account required' });
        return;
      }

      const {
        contactId,
        items,
        deliveryAddress,
        paymentStatus,
        notes,
        customerName,
        customerPhone
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: 'At least one catalog item is required.' });
        return;
      }

      const order = await OrderService.createOrder({
        businessId,
        contactId,
        items,
        deliveryAddress,
        paymentStatus,
        notes,
        customerName,
        customerPhone
      });

      res.status(201).json({
        success: true,
        message: `Order #${order.orderNumber} successfully placed!`,
        order
      });
    } catch (err: any) {
      next(err);
    }
  }

  public static async getOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(401).json({ success: false, error: 'Unauthorized: Business account required' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as any;

      const result = await OrderService.getOrders({
        businessId,
        limit,
        offset,
        status
      });

      res.json({
        success: true,
        ...result
      });
    } catch (err: any) {
      next(err);
    }
  }

  public static async updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const orderId = req.params.id;

      if (!businessId || !orderId) {
        res.status(400).json({ success: false, error: 'Business ID and order ID are required.' });
        return;
      }

      const { status, paymentStatus } = req.body;
      const updated = await OrderService.updateOrderStatus({
        orderId,
        businessId,
        status,
        paymentStatus
      });

      res.json({
        success: true,
        order: updated
      });
    } catch (err: any) {
      next(err);
    }
  }
}
