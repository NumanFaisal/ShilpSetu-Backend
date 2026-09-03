import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { catalogService } from '../services/catalog.service';

const router = Router();

router.get('/catalog/:artisanId/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisanId = Number(req.params.artisanId);
    const pdfBuffer = await catalogService.generateArtisanPdf(artisanId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="catalog-artisan-${artisanId}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
