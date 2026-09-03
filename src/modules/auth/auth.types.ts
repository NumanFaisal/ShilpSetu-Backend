import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits (optionally with + prefix)'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password is too long'),
});

export const signinSchema = z.object({
  phone: z.string().trim().min(1, 'Phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;

/** Public-facing user object — never includes the password hash. */
export interface PublicUser {
  id: number;
  name: string;
  phone: string;
  role: string;
  language: string;
  createdAt: string;
}
