import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { RagService } from '../services/rag.service';

export class RagController {
  public static async syncEmbeddings(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await RagService.syncBusinessCatalog(businessId);
      res.json({
        success: true,
        message: `Successfully indexed ${result.syncedCount} items into pgvector.`,
        syncedCount: result.syncedCount
      });
    } catch (err) {
      next(err);
    }
  }

  public static async searchSemantic(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { query, limit } = req.body;

      if (!query) {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const results = await RagService.semanticSearch({
        businessId,
        query,
        limit: limit ? parseInt(limit, 10) : 5
      });

      res.json({
        success: true,
        query,
        count: results.length,
        results
      });
    } catch (err) {
      next(err);
    }
  }

  public static async uploadDocument(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { name, type, size, content, isBase64, category } = req.body;

      if (!name || !content) {
        res.status(400).json({ success: false, error: 'Document name and content are required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const doc = await RagService.indexDocument({
        businessId,
        name,
        type: type || 'TXT',
        size: size || `${(content.length / 1024).toFixed(1)} KB`,
        content,
        isBase64,
        category
      });

      res.status(201).json({
        success: true,
        message: `Successfully indexed ${doc.name} into vector memory (${doc.chunksCount} chunks).`,
        document: doc
      });
    } catch (err) {
      next(err);
    }
  }

  public static async listDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await RagService.listDocuments(businessId);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteDocument(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { id } = req.params;

      if (!businessId || !id) {
        res.status(400).json({ success: false, error: 'Business account and Document ID required' });
        return;
      }

      const result = await RagService.deleteDocument(businessId, id);
      res.json({ message: 'Document deleted from vector memory', ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async reindexDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      await RagService.syncBusinessCatalog(businessId);
      const result = await RagService.listDocuments(businessId);
      res.json({
        success: true,
        message: 'Embeddings regenerated successfully via LangChain & Gemini.',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  public static async queryKnowledgeBase(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business?.id;
      const { query } = req.body;

      if (!query) {
        res.status(400).json({ success: false, error: 'query is required' });
        return;
      }

      if (!businessId) {
        res.status(400).json({ success: false, error: 'Business account required' });
        return;
      }

      const result = await RagService.queryKnowledgeBase({
        businessId,
        query
      });

      res.json({
        success: true,
        query,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
}
