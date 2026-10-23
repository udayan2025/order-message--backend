import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { ErpService } from '../services/erp.service';

export class ErpController {
  public static async queryErp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = req.body;
      const businessId = req.business?.id;

      if (!query) {
        res.status(400).json({ success: false, error: 'query string is required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await ErpService.queryErp({
        businessId,
        query
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
