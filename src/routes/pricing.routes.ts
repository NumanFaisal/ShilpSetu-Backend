import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { pricingService } from '../services/pricing.service';

const router = Router();

/**
 * POST /api/pricing/estimate
 * Calculate AI pricing recommendation, minimum base cost, benchmark e-commerce range,
 * and margin breakdown chart.
 */
router.post(['/pricing/estimate', '/estimate'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      category,
      material,
      craftComplexity,
      materialCost,
      labourHours,
      wageRate,
      labourCost,
      quantity,
      debug,
      productId,
    } = req.body || {};

    const isDebug = debug === true || debug === 'true' || req.query.debug === '1';

    if (!name && !category) {
      return res.status(400).json({ error: 'No product details provided' });
    }

    const result = await pricingService.estimatePricing({
      name,
      category,
      material,
      craftComplexity,
      materialCost: Number(materialCost) || 0,
      labourHours: Number(labourHours) || 0,
      wageRate: wageRate != null ? Number(wageRate) : undefined,
      labourCost: labourCost != null ? Number(labourCost) : undefined,
      quantity: quantity != null ? Number(quantity) : 1,
      debug: isDebug,
      productId: productId ? Number(productId) : undefined,
    });

    res.json(result);
  } catch (err: any) {
    if (err.statusCode || err.status) {
      return res.status(err.statusCode || err.status).json({ error: err.message });
    }
    console.error('[pricing/estimate] error:', err?.message || err);
    res.status(500).json({ error: 'Pricing estimate failed. Please try again.' });
  }
});

/**
 * POST /api/pricing/:productId/save
 * Save calculated pricing details directly to the database for an artisan product.
 */
router.post('/pricing/:productId/save', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    const body = req.body || {};

    const result = await pricingService.estimatePricing({
      ...body,
      productId,
    });

    res.json({
      message: 'Pricing saved successfully.',
      pricing: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pricing/:productId
 * Fetch saved pricing details for a product.
 */
router.get('/pricing/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    const pricing = await pricingService.getPricingForProduct(productId);
    res.json(pricing);
  } catch (err) {
    next(err);
  }
});

export default router;
