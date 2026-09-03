import { Router } from 'express';
import { styleController } from '../controllers/style.controller';

const router = Router();

// These routes are PUBLIC — no authentication required.
// The frontend needs them to show style previews before the user signs in.

// GET /api/studio-styles — list all styles with base64 previews
router.get('/studio-styles', styleController.listStyles);

// GET /api/studio-styles/:styleId/preview — single style preview image
router.get('/studio-styles/:styleId/preview', styleController.getPreview);

export default router;
