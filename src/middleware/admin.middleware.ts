import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/http-error';

/**
 * Guards routes so only users with the `admin` role can access them.
 * Must run AFTER `authenticate` (which populates `req.user`).
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, 'Authentication required.'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(new HttpError(403, 'Admin access required.'));
    return;
  }
  next();
}
