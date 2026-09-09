import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/signup & /register — register a new user (email/username + password)
router.post('/signup', authController.signup);
router.post('/register', authController.signup);

// POST /api/auth/signin & /login — log in and receive a JWT (email/username + password)
router.post('/signin', authController.signin);
router.post('/login', authController.signin);

// POST /api/auth/send-otp — send a 6-digit OTP to a phone number
router.post('/send-otp', authController.sendOtp);

// POST /api/auth/verify-otp — verify OTP; auto-creates account if phone is new
router.post('/verify-otp', authController.verifyOtp);

// POST /api/auth/profile — update artisan/user profile
router.post('/profile', authenticate, authController.setupProfile);

export default router;
