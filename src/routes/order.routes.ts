import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', OrderController.createOrder);
router.get('/', OrderController.getOrders);
router.patch('/:id', OrderController.updateOrderStatus);

export default router;
