import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { TemplateService } from '../services/template.service';

export class TemplateController {
  public static async listTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const templates = await TemplateService.listTemplates(businessId);
      res.json({ success: true, count: templates.length, templates });
    } catch (err) {
      next(err);
    }
  }

  public static async createTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const template = await TemplateService.createTemplate(businessId, req.body);
      res.status(201).json({ success: true, template });
    } catch (err) {
      next(err);
    }
  }

  public static async updateTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const { id } = req.params;
      const template = await TemplateService.updateTemplate(id, businessId, req.body);
      res.json({ success: true, template });
    } catch (err) {
      next(err);
    }
  }

  public static async deleteTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const { id } = req.params;
      await TemplateService.deleteTemplate(id, businessId);
      res.json({ success: true, message: 'Template deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  public static async approveTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const { id } = req.params;
      const template = await TemplateService.approveTemplate(id, businessId);
      res.json({ success: true, template, message: 'Template approved with Meta WhatsApp Cloud API' });
    } catch (err) {
      next(err);
    }
  }

  public static async sendTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.business!.id;
      const { templateId, phone, variables } = req.body;
      if (!templateId || !phone) {
        res.status(400).json({ success: false, error: 'templateId and phone are required' });
        return;
      }
      const result = await TemplateService.sendTemplate({
        businessId,
        templateId,
        phone,
        variables
      });
      res.json({ success: true, result, message: 'Template message dispatched to WhatsApp' });
    } catch (err) {
      next(err);
    }
  }
}
