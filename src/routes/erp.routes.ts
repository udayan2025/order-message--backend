import { Router } from 'express';
import { ErpController } from '../controllers/erp.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Natural language query against catalog and ERP engine
router.post('/query', ErpController.queryErp);

export default router;
