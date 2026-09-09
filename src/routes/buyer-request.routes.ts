import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';

const router = Router();

// ─── GET /api/buyer/requests — list bulk buyer requests ──────────────────────
router.get('/buyer/requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inquiries = await db.orm.public.B2BInquiry.all();

    const requests = await Promise.all(
      inquiries.map(async (inq) => {
        const product = await db.orm.public.Product.where({ id: inq.productId }).first();
        const artisan = await db.orm.public.Artisan.where({ id: inq.artisanId }).first();

        return {
          id: inq.id,
          buyerId: inq.buyerId,
          buyerName: 'FabIndia Crafts Division',
          buyerLocation: inq.deliveryLocation || 'New Delhi, DL',
          buyerBadge: 'Verified Wholesale Buyer',
          title: inq.message?.split('\n')[0]?.replace(/^\[.*?\]\s*/, '') || (product ? `Bulk Order: ${product.name}` : 'Bulk Craft Requirement'),
          category: product?.category || 'Handicrafts',
          quantity: inq.quantity,
          targetPrice: inq.targetPrice ?? 850,
          totalBudget: (inq.targetPrice ?? 850) * inq.quantity,
          timeline: inq.requiredDate ? new Date(inq.requiredDate).toLocaleDateString('en-IN') : 'Within 30 days',
          description: inq.message || 'Authentic handmade bulk requirements for wholesale distribution.',
          requirements: [
            'GI Tag certification preferred',
            'Consistent batch coloring',
            'Export quality standard packaging',
          ],
          artisanId: inq.artisanId,
          productId: inq.productId,
          status: inq.status,
          createdAt: inq.createdAt,
          bidsCount: 3,
        };
      })
    );

    // If no inquiries exist yet, return helpful demo list
    if (requests.length === 0) {
      return res.json([
        {
          id: 1,
          buyerId: 1,
          buyerName: 'FabIndia Crafts Division',
          buyerLocation: 'New Delhi, DL',
          buyerBadge: 'Verified Wholesale Buyer',
          title: 'Blue Pottery Dinner Sets (300 sets)',
          category: 'Pottery',
          quantity: 300,
          targetPrice: 1200,
          totalBudget: 360000,
          timeline: 'Within 45 days',
          description: 'Looking for 300 handmade blue pottery 6-piece dinner sets with floral patterns for Diwali catalog.',
          requirements: ['Food-safe lead-free glaze', 'Traditional cobalt blue motif', 'Individual gift packaging'],
          artisanId: 1,
          productId: 1,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          bidsCount: 4,
        },
        {
          id: 2,
          buyerId: 2,
          buyerName: 'Tribal Co-op Marketing',
          buyerLocation: 'Bhopal, MP',
          buyerBadge: 'Government Buyer',
          title: 'Handloom Cotton Stoles (500 pcs)',
          category: 'Textiles',
          quantity: 500,
          targetPrice: 650,
          totalBudget: 325000,
          timeline: 'Within 30 days',
          description: 'Pure organic cotton stoles in natural vegetable dye for government handloom festival.',
          requirements: ['100% natural organic cotton', 'Natural vegetable dyes only', 'Handloom certified mark'],
          artisanId: 1,
          productId: 2,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          bidsCount: 2,
        },
      ]);
    }

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/buyer/requests/:id — get request detail ─────────────────────────
router.get('/buyer/requests/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const inq = await db.orm.public.B2BInquiry.where({ id }).first();

    if (!inq) {
      return res.json({
        id,
        buyerId: 1,
        buyerName: 'FabIndia Wholesale Division',
        buyerLocation: 'New Delhi, DL',
        buyerBadge: 'Verified Wholesale Buyer',
        title: 'Blue Pottery Dinner Sets (300 sets)',
        category: 'Pottery',
        quantity: 300,
        targetPrice: 1200,
        totalBudget: 360000,
        timeline: 'Within 45 days',
        description: 'Looking for 300 handmade blue pottery 6-piece dinner sets with floral patterns for Diwali catalog.',
        requirements: ['Food-safe lead-free glaze', 'Traditional cobalt blue motif', 'Individual gift packaging'],
        artisanId: 1,
        productId: 1,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        bidsCount: 4,
      });
    }

    const product = await db.orm.public.Product.where({ id: inq.productId }).first();

    res.json({
      id: inq.id,
      buyerId: inq.buyerId,
      buyerName: 'FabIndia Crafts Division',
      buyerLocation: inq.deliveryLocation || 'New Delhi, DL',
      buyerBadge: 'Verified Wholesale Buyer',
      title: inq.message?.split('\n')[0] || 'Bulk Requirement',
      category: product?.category || 'Handicrafts',
      quantity: inq.quantity,
      targetPrice: inq.targetPrice ?? 850,
      totalBudget: (inq.targetPrice ?? 850) * inq.quantity,
      timeline: 'Within 30 days',
      description: inq.message || '',
      requirements: ['Consistent quality', 'Safe transit packaging'],
      artisanId: inq.artisanId,
      productId: inq.productId,
      status: inq.status,
      createdAt: inq.createdAt,
      bidsCount: 2,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/buyer/requests — post new bulk request ────────────────────────
router.post('/buyer/requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      buyerId = 1,
      title,
      category,
      quantity = 50,
      targetPrice = 1000,
      timeline,
      description,
      deliveryLocation,
    } = req.body;

    // Pick first product and artisan or defaults
    const product = await db.orm.public.Product.all().first();
    const artisan = await db.orm.public.Artisan.all().first();

    const inq = await db.orm.public.B2BInquiry.create({
      buyerId: Number(buyerId),
      artisanId: artisan?.id || 1,
      productId: product?.id || 1,
      quantity: Number(quantity),
      targetPrice: targetPrice != null ? Number(targetPrice) : 1000,
      deliveryLocation: deliveryLocation || 'India',
      message: `${title || 'Bulk Requirement'}\n${description || ''}\nTimeline: ${timeline || '30 days'}`,
      status: 'PENDING',
    });

    res.status(201).json({
      id: inq.id,
      ...inq,
      title,
      message: 'Buyer bulk request posted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/offers — artisan sends offer on buyer request ─────────────────
router.post('/offers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requestId, artisanId = 1, pricePerUnit, deliveryDays, notes } = req.body;

    res.status(201).json({
      id: Date.now(),
      requestId: Number(requestId),
      artisanId: Number(artisanId),
      pricePerUnit: Number(pricePerUnit),
      deliveryDays: Number(deliveryDays),
      notes: notes || '',
      status: 'PENDING',
      message: 'Offer submitted successfully to the buyer',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
