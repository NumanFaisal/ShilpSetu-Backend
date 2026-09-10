import type { Request, Response, NextFunction } from 'express';
import { artisanService } from '../services/artisan.service';
import { createArtisanSchema, updateArtisanSchema } from '../modules/artisan/artisan.types';

export class ArtisanController {
  /** POST /api/artisans — onboarding step 2, right after signup/login. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const input = createArtisanSchema.parse(req.body);
      const artisan = await artisanService.createProfile(userId, input);
      res.status(201).json({ message: 'Artisan profile created.', artisan });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/artisans/me */
  async getMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const artisan = await artisanService.getByUserId(userId);
      res.json(artisan);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/artisans/me */
  async updateMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const input = updateArtisanSchema.parse(req.body);
      const artisan = await artisanService.updateProfile(userId, input);
      res.json({ message: 'Artisan profile updated.', artisan });
    } catch (err) {
      next(err);
    }
  }
}

export const artisanController = new ArtisanController();
