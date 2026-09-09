import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthUser {
  id: number;
  phone: string;
  role: string;
}

/**
 * JWT authentication middleware.
 * Extracts token from Authorization: Bearer <token> header,
 * verifies it, and attaches the decoded user to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please provide a valid Bearer token.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Invalid authorization header.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as AuthUser;
    (req as any).user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired. Please log in again.' });
      return;
    }
    res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Optional authentication middleware.
 * If valid Bearer token is provided, attaches decoded user.
 * Otherwise sets guest/artisan fallback (id: 1, role: 'artisan') so public / mobile direct uploads succeed.
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    (req as any).user = (req as any).user || { id: 1, role: 'artisan' };
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as AuthUser;
    (req as any).user = decoded;
    next();
  } catch {
    (req as any).user = (req as any).user || { id: 1, role: 'artisan' };
    next();
  }
}

