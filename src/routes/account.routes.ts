import { Router } from 'express';
import { AccountController } from '../controllers/account.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Listing or creating accounts
router.get('/', authMiddleware, AccountController.listAccounts);
router.post('/', AccountController.createAccount);

// Single account routes
router.get('/:id', authMiddleware, AccountController.getAccount);
router.put('/:id', authMiddleware, AccountController.updateAccount);
router.delete('/:id', authMiddleware, AccountController.deleteAccount);

export default router;
