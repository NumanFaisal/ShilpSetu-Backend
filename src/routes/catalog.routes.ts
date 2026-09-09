import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { catalogService } from '../services/catalog.service';

const router = Router();

/**
 * POST /api/catalog/generate
 * Public or authenticated endpoint for generating a smart bilingual catalog listing.
 * Accepts voice transcription or manual description and attributes.
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
 * GET /api/catalog/:artisanId/pdf
 * Generate printable PDF catalog for an artisan's published inventory.
 */
router.get('/catalog/:artisanId/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisanId = Number(req.params.artisanId);
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
