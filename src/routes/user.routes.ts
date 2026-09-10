import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';

const router = Router();

router.use('/users', authenticate);

// GET /api/users/me — current user + artisan profile + buyer profile metrics
router.get('/users/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new HttpError(404, 'User not found.');

    const artisan = await db.orm.public.Artisan.where({ userId }).all().first();

    // Calculate buyer stats
    const orders = await db.orm.public.Order.where({ buyerId: user.id }).all();
    const inquiries = await db.orm.public.B2BInquiry.where({ buyerId: user.id }).all();
    const connectedArtisanIds = new Set([
      ...orders.map((o) => o.artisanId),
      ...inquiries.map((i) => i.artisanId),
    ]);

    const buyerProfile = {
      companyName: user.name,
      contactName: user.name,
      phone: user.phone,
      location: 'New Delhi, India',
      state: 'Delhi',
      businessType: 'Boutique Retailer',
      isVerified: true,
      verified: true,
      rating: 4.8,
      totalOrders: orders.length,
      artisansConnected: connectedArtisanIds.size,
      activeRequests: inquiries.filter((i) => i.status === 'PENDING').length,
      bio: 'Sourcing authentic handcrafted home décor, handlooms, and traditional crafts.',
      preferences: ['Eco-friendly', 'Handloom Textiles', 'Bamboo Craft', 'Fair Trade Certified'],
    };

    res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      language: user.language,
      createdAt: user.createdAt,
      hasArtisanProfile: !!artisan,
      artisan: artisan ?? null,
      buyer: buyerProfile,
      buyerProfile,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me — update user profile fields
router.patch('/users/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { name, language } = req.body;

    const patch: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) patch.name = name.trim();
    if (typeof language === 'string' && language.trim()) patch.language = language.trim();

    if (Object.keys(patch).length > 0) {
      await db.orm.public.User.where({ id: userId }).update(patch as any);
    }

    const updated = await db.orm.public.User.where({ id: userId }).first();
    res.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
