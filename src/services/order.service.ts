import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';
import { artisanService } from './artisan.service';

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export class OrderService {
  /**
   * Converts an accepted B2BInquiry into an Order. Called from
   * marketplace.service.updateInquiryStatus() when status becomes
   * 'ACCEPTED' — this is the "Accept / Reject / Negotiate → Order" step
   * from the app's own user-journey diagram, which previously had no code
   * behind it at all.
   */
  async createFromInquiry(inquiry: {
    id: number;
    buyerId: number;
    artisanId: number;
    productId: number;
    quantity: number;
    targetPrice: number | null;
  }) {
    const product = await db.orm.public.Product.where({ id: inquiry.productId }).first();
    if (!product) throw new HttpError(404, 'Product for this inquiry no longer exists.');

    // Prefer the buyer's negotiated target price; fall back to list price.
    const unitPrice = inquiry.targetPrice ?? product.price ?? 0;
    const totalAmount = Math.round(unitPrice * inquiry.quantity * 100) / 100;

    return db.orm.public.Order.create({
      buyerId: inquiry.buyerId,
      artisanId: inquiry.artisanId,
      productId: inquiry.productId,
      quantity: inquiry.quantity,
      totalAmount,
      status: 'PENDING',
    });
  }

  /** GET /api/orders — every order against any of my products. */
  async listForArtisan(userId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);
    return db.orm.public.Order.where({ artisanId })
      .include('product', (p) => p)
      .all();
  }

  private async getOwned(userId: number, orderId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);
    const order = await db.orm.public.Order.where({ id: orderId })
      .include('product', (p) => p)
      .all()
      .first();
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.artisanId !== artisanId) throw new HttpError(403, 'You do not own this order.');
    return order;
  }

  /** GET /api/orders/:id */
  async getOne(userId: number, orderId: number) {
    return this.getOwned(userId, orderId);
  }

  /** PATCH /api/orders/:id/status — PENDING → CONFIRMED → SHIPPED → DELIVERED (or CANCELLED). */
  async updateStatus(userId: number, orderId: number, status: OrderStatus) {
    await this.getOwned(userId, orderId);
    await db.orm.public.Order.where({ id: orderId }).update({ status });
    return db.orm.public.Order.where({ id: orderId }).first();
  }
}

export const orderService = new OrderService();
