import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { signupSchema, signinSchema, sendOtpSchema, verifyOtpSchema } from '../modules/auth/auth.types';

export class AuthController {
  /** POST /api/auth/signup — register a new user */
  async signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = signupSchema.parse(req.body);
      const result = await authService.signup(input);
      res.status(201).json({
        message: 'Account created successfully.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/auth/signin — log in and receive a JWT */
  async signin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = signinSchema.parse(req.body);
      const result = await authService.signin(input);
      res.json({
        message: 'Signed in successfully.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/auth/send-otp — send a one-time password to a phone number */
  async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = sendOtpSchema.parse(req.body);
      const result = await authService.sendOtp(input);
      res.json({ message: 'OTP sent successfully.', ...result });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/auth/verify-otp — verify OTP and sign in (auto-creates account if new) */
  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = verifyOtpSchema.parse(req.body);
      const result = await authService.verifyOtp(input);
      res.json({ message: 'OTP verified successfully.', ...result });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
