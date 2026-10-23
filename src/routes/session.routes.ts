import { Router } from 'express';
import { SessionController } from '../controllers/session.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Sessions listing and initialization
router.get('/', authMiddleware, SessionController.listSessions);
router.post('/', authMiddleware, SessionController.createSession);

// SSE QR Stream (auth optional via query param for EventSource compatibility in browsers)
router.get('/:sessionId/qr-stream', SessionController.streamQr);

router.get('/:sessionId/status', authMiddleware, SessionController.getSessionStatus);
router.post('/:sessionId/pairing-code', authMiddleware, SessionController.requestPairingCode);
router.post('/:sessionId/refresh-qr', authMiddleware, SessionController.refreshQr);
router.post('/:sessionId/disconnect', authMiddleware, SessionController.disconnectSession);
router.delete('/:sessionId', authMiddleware, SessionController.deleteSession);

export default router;
