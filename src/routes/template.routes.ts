import { Router } from 'express';
import { TemplateController } from '../controllers/template.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', TemplateController.listTemplates);
router.post('/', TemplateController.createTemplate);
router.put('/:id', TemplateController.updateTemplate);
router.delete('/:id', TemplateController.deleteTemplate);
router.post('/:id/approve', TemplateController.approveTemplate);
router.post('/send', TemplateController.sendTemplate);

export default router;
