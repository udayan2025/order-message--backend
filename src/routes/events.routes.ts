import { Router } from 'express';
import { EventsController } from '../controllers/events.controller';

const router = Router();

// Real-time Server-Sent Events stream for workspace updates
router.get('/', EventsController.streamEvents);

export default router;
