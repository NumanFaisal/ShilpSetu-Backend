import type { Request, Response, NextFunction } from 'express';
import { orderService, isOrderStatus } from '../services/order.service';
import { HttpError } from '../lib/http-error';

function parseId(raw: string | undefined, label = 'id'): number {
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) throw new HttpError(400, `Invalid ${label}.`);
  return id;
}

export class OrderController {
  /** POST /api/orders — Buyer creates a new order */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buyerId = (req as any).user.id;
      const { productId, quantity, deliveryAddress, notes } = req.body;
      const order = await orderService.createForBuyer(buyerId, {
        productId: Number(productId),
        quantity: Number(quantity),
        deliveryAddress: typeof deliveryAddress === 'string' ? deliveryAddress : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
      });
      res.status(201).json({ message: 'Order placed successfully.', order });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/orders/buyer — Explicit buyer order history */
  async listBuyerOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buyerId = (req as any).user.id;
      const orders = await orderService.listForBuyer(buyerId);
      res.json({ orders });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/orders — Role-aware order listing */
  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const asBuyer = req.query['as'] === 'buyer' || user.role === 'buyer';

      if (asBuyer) {
        const orders = await orderService.listForBuyer(user.id);
        res.json({ orders });
      } else {
        const orders = await orderService.listForArtisan(user.id);
        res.json({ orders });
      }
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
        throw new HttpError(400, 'status must be one of PENDING, CONFIRMED, IN_PRODUCTION, SHIPPED, DELIVERED, CANCELLED.');
      }
      const order = await orderService.updateStatus(userId, orderId, status as any);
      res.json({ message: 'Order status updated.', order });
    } catch (err) {
      next(err);
    }
  }
}

export const orderController = new OrderController();
