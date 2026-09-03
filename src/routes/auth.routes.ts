import { Router } from 'express';
import { authController } from '../controllers/auth.controller';

const router = Router();

// These routes are PUBLIC — no authenticate middleware.

// POST /api/auth/signup — register a new user (phone + password)
router.post('/signup', authController.signup);

// POST /api/auth/signin — log in and receive a JWT (phone + password)
router.post('/signin', authController.signin);

// POST /api/auth/send-otp — send a 6-digit OTP to a phone number
router.post('/send-otp', authController.sendOtp);

// POST /api/auth/verify-otp — verify OTP; auto-creates account if phone is new
router.post('/verify-otp', authController.verifyOtp);

export default router;
