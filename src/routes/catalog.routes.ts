import { Router } from 'express';
import { CatalogController } from '../controllers/catalog.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Get live catalog & bulk create/update
router.get('/', CatalogController.getCatalog);
router.get('/categories', CatalogController.getCatalogCategories);
router.get('/metrics', CatalogController.getCatalogMetrics);
router.get('/summary', CatalogController.getCatalogMetrics);
router.post('/', CatalogController.createCatalog);
router.post('/upload-pdf', CatalogController.uploadCatalogPdf);
router.post('/upload-file', CatalogController.uploadCatalogPdf);

// Single item modifications
router.put('/:id', CatalogController.updateItem);
router.delete('/:id', CatalogController.deleteItem);

export default router;
