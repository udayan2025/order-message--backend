import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Send message, media & geo location endpoints
router.post('/send', MessageController.sendMessage);
router.post('/send-media', MessageController.sendMedia);
router.post('/send-location', MessageController.sendLocation);
router.get('/location/:contactId', MessageController.getLatestLocation);

// Contacts and message history
router.get('/contacts', MessageController.getContacts);
router.get('/conversation/:contactId', MessageController.getMessages);
router.get('/:contactId', MessageController.getMessages);

// Delete operations
router.delete('/contacts/:contactId', MessageController.deleteContact);
router.delete('/conversation/:contactId', MessageController.deleteContact);
router.delete('/batch-delete', MessageController.deleteMessages);

// Pin message operation
router.post('/pin', MessageController.togglePinMessage);

// Customer simulation endpoint for testing product inquiries & AI replies
router.post('/simulate-inbound', MessageController.simulateInbound);

export default router;
