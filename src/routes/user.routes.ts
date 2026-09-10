import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';

const router = Router();

router.use('/users', authenticate);

// GET /api/users/me — current user + artisan profile (if onboarding is done)
router.get('/users/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new HttpError(404, 'User not found.');

    const artisan = await db.orm.public.Artisan.where({ userId }).all().first();

    res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      language: user.language,
      createdAt: user.createdAt,
      hasArtisanProfile: !!artisan,
      artisan: artisan ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
