import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { CatalogService } from '../services/catalog.service';

export class CatalogController {
  public static async getCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const category = req.query.category as string;
      const search = req.query.search as string;
      const stockStatus = req.query.stockStatus as string;
      const sortBy = req.query.sortBy as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const result = await CatalogService.getCatalog(businessId, {
        category,
        search,
        stockStatus,
        sortBy,
        page,
        limit
      });

      res.json({
        success: true,
        items: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      });
    } catch (err) {
      next(err);
    }
  }

  public static async createCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const { items, item } = req.body;

      if (Array.isArray(items)) {
        const saved = await CatalogService.bulkUpsert(businessId, items);
        const metrics = await CatalogService.getCatalogMetrics(businessId).catch(() => null);
        res.status(201).json({ success: true, count: saved.length, items: saved, metrics });
        return;
      }

      const target = item || req.body;
      if (!target.name || !String(target.name).trim()) {
        res.status(400).json({ success: false, error: 'Product name is required' });
        return;
      }

      const saved = await CatalogService.upsertItem({
        businessId,
        ...target,
        name: String(target.name).trim(),
        price: parseFloat(target.price) || 0,
        stock: parseInt(target.stock, 10) ?? 10
      });

      // Compute latest 5 inventory KPI cards after adding item
      const metrics = await CatalogService.getCatalogMetrics(businessId);

      res.status(201).json({ 
        success: true, 
        item: saved,
        metrics,
        message: `Product "${saved.name}" (${saved.sku}) successfully added to catalog and pgvector knowledge base.`
      });
    } catch (err) {
      next(err);
    }
  }

  public static async updateItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { id } = req.params;
      const updated = await CatalogService.updateItem(id, req.body);
      const metrics = businessId ? await CatalogService.getCatalogMetrics(businessId).catch(() => null) : null;
      res.json({ success: true, item: updated, metrics });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { id } = req.params;
      await CatalogService.deleteItem(id);
      const metrics = businessId ? await CatalogService.getCatalogMetrics(businessId).catch(() => null) : null;
      res.json({ success: true, message: 'Item deleted', id, metrics });
    } catch (err) {
      next(err);
    }
  }

  public static async uploadCatalogPdf(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const { fileName, content, defaultCategory } = req.body;
      if (!fileName || !content) {
        res.status(400).json({ success: false, error: 'fileName and content (base64) are required' });
        return;
      }

      const result = await CatalogService.uploadAndParsePdf({
        businessId,
        fileName,
        base64Content: content,
        defaultCategory
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to parse and import catalog PDF' });
    }
  }

  public static async getCatalogMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const category = req.query.category as string;
      const metrics = await CatalogService.getCatalogMetrics(businessId, category);
      res.json(metrics);
    } catch (err) {
      next(err);
    }
  }

  public static async getCatalogCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await CatalogService.getCatalogCategories(businessId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
