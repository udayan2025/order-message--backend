import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './routes';
import { requestLogger } from './middleware/logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { ENV } from './config/env';

export function createApp(): Express {
  const app = express();

  // CORS configuration
  app.use(
    cors({
      origin: '*', // Allow connections from frontend workspace
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'Accept']
    })
  );

  // Body Parsing Middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging
  app.use(requestLogger);

  // Serve static uploaded media files
  app.use('/uploads', express.static(ENV.UPLOAD_DIR));

  // Mount API V1 routes
  app.use('/api/v1', apiRouter);

  // Global root health check
  app.get('/', (req, res) => {
    res.json({
      name: 'MessageAPI WhatsApp Gateway & RAG ERP Engine',
      version: '1.0.0',
      status: 'operational',
      docs: '/api/v1/health'
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
