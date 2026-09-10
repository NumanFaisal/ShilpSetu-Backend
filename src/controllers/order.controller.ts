import type { Request, Response, NextFunction } from 'express';
import { orderService, isOrderStatus } from '../services/order.service';
import { HttpError } from '../lib/http-error';

function parseId(raw: string | undefined, label = 'id'): number {
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) throw new HttpError(400, `Invalid ${label}.`);
  return id;
}

export class OrderController {
  /** GET /api/orders */
  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const orders = await orderService.listForArtisan(userId);
      res.json({ orders });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/orders/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const orderId = parseId(req.params['id'] as string, 'order id');
      const order = await orderService.getOne(userId, orderId);
      res.json(order);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/orders/:id/status */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const orderId = parseId(req.params['id'] as string, 'order id');
      const { status } = req.body;
      if (typeof status !== 'string' || !isOrderStatus(status)) {
        throw new HttpError(400, 'status must be one of PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED.');
      }
      const order = await orderService.updateStatus(userId, orderId, status);
      res.json({ message: 'Order status updated.', order });
    } catch (err) {
      next(err);
    }
  }
}

export const orderController = new OrderController();
