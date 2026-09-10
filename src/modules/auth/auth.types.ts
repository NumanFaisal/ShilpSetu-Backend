import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(100, 'Name is too long'),
  email: z.string().trim().min(3, 'Email or username is required').max(100),
  username: z.string().trim().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password is too long'),
  role: z.enum(['artisan', 'buyer', 'user', 'admin']).default('artisan').optional(),
});

export const signinSchema = z.object({
  email: z.string().trim().optional(),
  username: z.string().trim().optional(),
  identifier: z.string().trim().optional(),
  phone: z.string().trim().optional(), // backward compat
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['artisan', 'buyer', 'user', 'admin']).optional(),
}).refine(data => !!(data.email || data.username || data.identifier || data.phone), {
  message: 'Email or username is required',
  path: ['email'],
});

export const sendOtpSchema = z.object({
  phone: z.string().trim().min(1, 'Phone or identifier is required'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().trim().min(1, 'Phone or identifier is required'),
  code: z.string().min(4, 'Verification code is required'),
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['artisan', 'buyer', 'user', 'admin']).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;
export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/** Public-facing user object — never includes the password hash. */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  username: string;
  phone?: string;
  role: string;
  language: string;
  createdAt: string;
}
