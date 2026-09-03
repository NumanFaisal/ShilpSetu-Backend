import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { analyticsService } from '../services/analytics.service';

const router = Router();

// All admin routes require a valid JWT + the `admin` role.
router.use(authenticate, requireAdmin);

router.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getDashboard());
  } catch (err) { next(err); }
});

router.get('/artisans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.listArtisans());
  } catch (err) { next(err); }
});

router.get('/products', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.listProducts());
  } catch (err) { next(err); }
});

router.get('/inquiries', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.listInquiries());
  } catch (err) { next(err); }
});

router.get('/revenue', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getEconomicsStats());
  } catch (err) { next(err); }
});

router.get('/regional', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getOnboardingStats());
  } catch (err) { next(err); }
});

router.get('/marketplaces', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await analyticsService.getMarketplaceHealth());
  } catch (err) { next(err); }
});

export default router;
