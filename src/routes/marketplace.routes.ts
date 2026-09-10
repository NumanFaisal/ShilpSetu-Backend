import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { marketplaceService } from '../services/marketplace.service';
import { artisanService } from '../services/artisan.service';
import { isMarketplace } from '../modules/marketplace/marketplace.registry';
import { HttpError } from '../lib/http-error';
import type { Marketplace } from '../modules/marketplace/marketplace.types';

const router = Router();

// ---------------------------------------------------------------------------
// Public storefront + discovery routes (no auth)
// ---------------------------------------------------------------------------

// NEW — cross-store product search/browse for buyers.
// GET /api/marketplace/search?q=&category=&craftType=&state=&minPrice=&maxPrice=&page=&pageSize=
router.get('/marketplace/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, category, craftType, state, minPrice, maxPrice, page, pageSize } = req.query;
    // Build params without undefined values to satisfy exactOptionalPropertyTypes
    const params: Parameters<typeof marketplaceService.searchProducts>[0] = {};
    if (typeof q === 'string') params.q = q;
    if (typeof category === 'string') params.category = category;
    if (typeof craftType === 'string') params.craftType = craftType;
    if (typeof state === 'string') params.state = state;
    if (minPrice) params.minPrice = Number(minPrice);
    if (maxPrice) params.maxPrice = Number(maxPrice);
    if (page) params.page = Number(page);
    if (pageSize) params.pageSize = Number(pageSize);
    const results = await marketplaceService.searchProducts(params);
    res.json(results);
  } catch (err) { next(err); }
});

// NEW — single published product, independent of which artisan/storefront it's on.
// GET /api/marketplace/products/:id
router.get('/marketplace/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await marketplaceService.getPublicProduct(Number(req.params['id'] as string));
    res.json(product);
  } catch (err) { next(err); }
});

router.get('/public/stores/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await marketplaceService.getStorefront(req.params['slug'] as string);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/public/stores/:slug/qr.png', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = await marketplaceService.getStorefrontQr(req.params['slug'] as string);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.post('/public/inquiries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      buyerId, buyerName, buyerEmail, buyerPhone,
      artisanId, productId, quantity, targetPrice,
      deliveryLocation, requiredDate, message,
    } = req.body;

    if (!artisanId || !productId || quantity == null) {
      throw new HttpError(400, 'artisanId, productId, and quantity are required.');
    }

    // The B2BInquiry table has no buyer contact columns, so fold contact
    // details into the message for the artisan to read.
    const contactLine = [buyerName && `Name: ${buyerName}`, buyerEmail && `Email: ${buyerEmail}`, buyerPhone && `Phone: ${buyerPhone}`]
      .filter(Boolean)
      .join(', ');
    const fullMessage = [contactLine && `[${contactLine}]`, message].filter(Boolean).join('\n');

    const input: Record<string, unknown> = {
      buyerId: buyerId ? Number(buyerId) : 0, // anonymous until a buyer account exists
      artisanId: Number(artisanId),
      productId: Number(productId),
      quantity: Number(quantity),
    };
    if (targetPrice != null) input.targetPrice = Number(targetPrice);
    if (deliveryLocation) input.deliveryLocation = deliveryLocation;
    if (requiredDate) input.requiredDate = requiredDate;
    if (fullMessage) input.message = fullMessage;

    const inquiry = await marketplaceService.createInquiry(input as any);
    res.status(201).json(inquiry);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Authenticated artisan routes
// ---------------------------------------------------------------------------

// FIXED: was calling listInquiries(req.user!.id) — the User id, not the
// Artisan id these rows are actually keyed on. Now resolves the artisan
// profile first, same as the new product/order/artisan routes do.
router.get('/artisan/inquiries', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisanId = await artisanService.requireArtisanId((req as any).user.id);
    const inquiries = await marketplaceService.listInquiries(artisanId);
    res.json(inquiries);
  } catch (err) { next(err); }
});

router.patch('/inquiries/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!['ACCEPTED', 'DECLINED', 'COMPLETED'].includes(status)) {
      throw new HttpError(400, 'Status must be ACCEPTED, DECLINED, or COMPLETED.');
    }
    const result = await marketplaceService.updateInquiryStatus(Number(req.params.id), status);
    res.json(result);
  } catch (err) { next(err); }
});

// Marketplace connections
// FIXED: same userId-vs-artisanId issue as /artisan/inquiries above.
router.get('/marketplaces/connections', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artisanId = await artisanService.requireArtisanId((req as any).user.id);
    const connections = await marketplaceService.getConnections(artisanId);
    res.json(connections);
  } catch (err) { next(err); }
});

router.post('/marketplaces/:marketplace/connect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mp = (req.params['marketplace'] as string).toUpperCase();
    if (!isMarketplace(mp)) throw new HttpError(400, `Unknown marketplace: ${mp}`);
    const artisanId = await artisanService.requireArtisanId((req as any).user.id);
    const result = await marketplaceService.connect(artisanId, mp as Marketplace, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/marketplaces/:marketplace/disconnect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mp = (req.params['marketplace'] as string).toUpperCase();
    if (!isMarketplace(mp)) throw new HttpError(400, `Unknown marketplace: ${mp}`);
    const artisanId = await artisanService.requireArtisanId((req as any).user.id);
    const result = await marketplaceService.disconnect(artisanId, mp as Marketplace);
    res.json(result);
  } catch (err) { next(err); }
});

// Publish & status
router.post('/products/:id/publish', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawMarketplaces = req.body.marketplaces || req.body.channels;
    if (!Array.isArray(rawMarketplaces) || !rawMarketplaces.length) {
      throw new HttpError(400, '"marketplaces" or "channels" must be a non-empty array of marketplace names.');
    }
    const result = await marketplaceService.publishToMarketplaces(
      Number(req.params.id),
      rawMarketplaces.map((m: string) => m.toUpperCase()) as Marketplace[],
    );
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/products/:id/marketplaces', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listings = await marketplaceService.getProductMarketplaceStatus(Number(req.params.id));
    res.json(listings);
  } catch (err) { next(err); }
});

// Schema exports
router.get('/exports/ondc/:productId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = await marketplaceService.exportOnDc(Number(req.params.productId));
    res.json(schema);
  } catch (err) { next(err); }
});

router.get('/exports/gem/:productId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = await marketplaceService.exportGem(Number(req.params.productId));
    res.json(schema);
  } catch (err) { next(err); }
});

export default router;
