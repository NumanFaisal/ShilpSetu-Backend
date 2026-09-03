import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../prisma/db';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';
import type { SignupInput, SigninInput, PublicUser } from '../modules/auth/auth.types';

const BCRYPT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

export class AuthService {
  /**
   * Registers a new user and returns a signed JWT.
   * Throws 409 if the phone number is already registered.
   */
  async signup(input: SignupInput) {
    const existing = await db.orm.public.User.where({ phone: input.phone }).first();
    if (existing) {
      throw new HttpError(409, 'This phone number is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await db.orm.public.User.create({
      name: input.name,
      phone: input.phone,
      passwordHash,
      role: 'user',
      language: 'en',
    });

    const token = this.signToken(user.id, user.phone, user.role);

    return { token, user: this.toPublic(user) };
  }

  /**
   * Verifies credentials and returns a signed JWT.
   * Throws 401 on unknown phone or wrong password.
   */
  async signin(input: SigninInput) {
    const user = await db.orm.public.User.where({ phone: input.phone }).first();
    if (!user) {
      throw new HttpError(401, 'Invalid phone number or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, 'Invalid phone number or password');
    }

    const token = this.signToken(user.id, user.phone, user.role);

    return { token, user: this.toPublic(user) };
  }

  private signToken(id: number, phone: string, role: string): string {
    return jwt.sign({ id, phone, role }, env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY } as jwt.SignOptions);
  }

  /** Strips sensitive fields (passwordHash) from the DB row. */
  private toPublic(user: {
    id: number;
    name: string;
    phone: string;
    role: string;
    language: string;
    createdAt: unknown;
  }): PublicUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      language: user.language,
      createdAt: String(user.createdAt),
    };
  }
}

export const authService = new AuthService();
