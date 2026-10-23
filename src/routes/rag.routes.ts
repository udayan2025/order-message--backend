import { Router } from 'express';
import { RagController } from '../controllers/rag.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Synchronize all business catalog items into pgvector embeddings
router.post('/sync', RagController.syncEmbeddings);

// Perform semantic search on catalog vectors
router.post('/search', RagController.searchSemantic);

// Knowledge Base Documents API
router.get('/documents', RagController.listDocuments);
router.post('/documents/upload', RagController.uploadDocument);
router.delete('/documents/:id', RagController.deleteDocument);
router.post('/documents/reindex', RagController.reindexDocuments);

// RAG Search & Retrieval Simulator with Groq synthesis
router.post('/query', RagController.queryKnowledgeBase);

export default router;
