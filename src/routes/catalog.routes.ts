import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { catalogService } from '../services/catalog.service';

const router = Router();

/**
 * POST /api/catalog/generate
 * Generates a smart, detailed bilingual catalog listing using Gemini API.
 */
router.post(['/catalog/generate', '/generate'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { voiceTranscription, manualDescription, attributes, language } = req.body || {};
    const result = await catalogService.generateSmartCatalog({
      voiceTranscription,
      manualDescription,
      attributes,
      language,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalog/preview-pdf
 * Generates and downloads a printable PDF catalog directly from live draft data.
 */
router.post('/catalog/preview-pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draftData = req.body || {};
    const pdfBuffer = await catalogService.generateDraftPdf(draftData);

    const safeTitle = (draftData.name || 'product')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="shilpsetu-catalog-${safeTitle}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalog/product/:productId/pdf or /api/catalog/:productId/pdf
 * Generate printable PDF catalog for an individual product.
 */
router.get(['/catalog/product/:productId/pdf', '/catalog/:productId/pdf'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }
    const pdfBuffer = await catalogService.generateProductPdf(productId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="product-catalog-${productId}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/catalog/:productId/save
 * Save or update generated catalog details for an existing product.
 */
router.post('/catalog/:productId/save', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    const saved = await catalogService.saveProductCatalog(productId, req.body || {});
    res.json({ message: 'Catalog details saved successfully.', catalogue: saved });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalog/:productId
 * Fetch saved catalog details for a product.
 */
router.get('/catalog/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    const catalogue = await catalogService.getProductCatalog(productId);
    res.json(catalogue);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/catalog/artisan/:artisanId/pdf or /api/catalog/:artisanId/pdf
 * Generate printable PDF catalog for an artisan's complete published inventory.
 */
router.get(['/catalog/artisan/:artisanId/pdf', '/catalog/:artisanId/pdf'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisanId = Number(req.params.artisanId);
    if (isNaN(artisanId)) {
      res.status(400).json({ error: 'Invalid artisan ID' });
      return;
    }
    const pdfBuffer = await catalogService.generateArtisanPdf(artisanId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="catalog-artisan-${artisanId}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
