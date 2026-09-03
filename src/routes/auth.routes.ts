import { Router } from 'express';
import { authController } from '../controllers/auth.controller';

const router = Router();

// These routes are PUBLIC — no authenticate middleware.

// POST /api/auth/signup — register a new user
router.post('/signup', authController.signup);

// POST /api/auth/signin — log in and receive a JWT
router.post('/signin', authController.signin);

export default router;
