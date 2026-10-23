import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { ENV } from '../config/env';
import authRoutes from './auth.routes';
import accountRoutes from './account.routes';
import sessionRoutes from './session.routes';
import messageRoutes from './message.routes';
import catalogRoutes from './catalog.routes';
import ragRoutes from './rag.routes';
import erpRoutes from './erp.routes';
import eventsRoutes from './events.routes';
import orderRoutes from './order.routes';
import { WebhookController } from '../controllers/webhook.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'MessageAPI Core Gateway & RAG Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Dedicated instant PDF download endpoint with attachment header
apiRouter.get(['/media/pdf/:fileName', '/erp/download-pdf'], (req, res) => {
  const rawFileName = req.params.fileName || String(req.query.file || '');
  const fileName = path.basename(rawFileName);

  if (!fileName || !fileName.toLowerCase().endsWith('.pdf')) {
    return res.status(400).json({ error: 'Only PDF files may be downloaded.' });
  }

  const filePath = path.join(ENV.UPLOAD_DIR, fileName);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.sendFile(path.resolve(filePath));
  }

  return res.status(404).json({ error: 'PDF file not found or has expired on the server.' });
});

// Mount module sub-routers
apiRouter.use('/auth', authRoutes);
apiRouter.use('/accounts', accountRoutes);
apiRouter.use('/sessions', sessionRoutes);
apiRouter.use('/messages', messageRoutes);
apiRouter.use('/catalog', catalogRoutes);
apiRouter.use('/rag', ragRoutes);
apiRouter.use('/erp', erpRoutes);
apiRouter.use('/events', eventsRoutes);
apiRouter.use('/orders', orderRoutes);

// Webhook simulation / testing endpoint
apiRouter.post('/webhooks/simulate', authMiddleware, WebhookController.simulateInbound);

export default apiRouter;
