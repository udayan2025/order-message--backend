import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public auth endpoints
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Authenticated or domain-based password update
router.post('/update-password', AuthController.updatePassword);

// Get current logged-in account
router.get('/me', AuthController.me);

export default router;
