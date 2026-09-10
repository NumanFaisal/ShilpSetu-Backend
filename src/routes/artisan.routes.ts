import { Router } from 'express';
import { artisanController } from '../controllers/artisan.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Every route here requires a signed-in User.
router.use(authenticate);

// POST /api/artisans — create the artisan profile (once) for the logged-in user
router.post('/artisans', artisanController.create);

// GET /api/artisans/me — fetch my own artisan profile
router.get('/artisans/me', artisanController.getMine);

// PATCH /api/artisans/me — update my own artisan profile
router.patch('/artisans/me', artisanController.updateMine);

export default router;
