import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';
import { artisanService } from './artisan.service';
import { instantToDate, instantToString } from '../lib/temporal';

const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value.toUpperCase());
}

function statusToLabel(status: string): string {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'CONFIRMED':
      return 'Order Confirmed';
    case 'IN_PRODUCTION':
      return 'In Production';
    case 'SHIPPED':
      return 'Shipped';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

async function decorateOrder(order: any) {
  const product = order.product ?? (await db.orm.public.Product.where({ id: order.productId }).first());
  const artisan = await db.orm.public.Artisan.where({ id: order.artisanId }).include('user', (u) => u).all().first();
  const buyer = await db.orm.public.User.where({ id: order.buyerId }).first();

  const totalAmount = order.totalAmount ?? 0;
  const quantity = order.quantity ?? 1;
  const unitPrice = product?.price ?? (quantity > 0 ? Math.round(totalAmount / quantity) : 0);
  const advancePaid = Math.round(totalAmount * 0.3);
  const balanceDue = totalAmount - advancePaid;

  const orderDate = instantToDate(order.createdAt);
  const deliveryDate = new Date(orderDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const createdAtIso = instantToString(order.createdAt);

  const status = (order.status || 'PENDING').toUpperCase();

  const milestones = [
    { label: 'Order Confirmed', date: orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: ['CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'].includes(status), current: status === 'CONFIRMED' },
    { label: 'Materials Sourced', date: new Date(orderDate.getTime() + 3 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'].includes(status), current: false },
    { label: 'Production Started', date: new Date(orderDate.getTime() + 5 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'].includes(status), current: status === 'IN_PRODUCTION' },
    { label: 'Quality Check & Packed', date: new Date(orderDate.getTime() + 9 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: ['SHIPPED', 'DELIVERED'].includes(status), current: false },
    { label: 'Shipped', date: new Date(orderDate.getTime() + 11 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: ['SHIPPED', 'DELIVERED'].includes(status), current: status === 'SHIPPED' },
    { label: 'Delivered', date: deliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), done: status === 'DELIVERED', current: status === 'DELIVERED' },
  ];

  return {
    id: order.id,
    displayId: `#SS${order.id}`,
    productId: order.productId,
    productName: product?.name ?? 'Handcrafted Item',
    buyerId: order.buyerId,
    buyerName: buyer?.name ?? 'Direct Buyer',
    artisanId: order.artisanId,
    artisanName: artisan?.storeName ?? artisan?.user?.name ?? 'Artisan',
    quantity,
    unitPrice,
    totalAmount,
    currency: '₹',
    totalLabel: `₹${totalAmount.toLocaleString('en-IN')}`,
    status,
    statusLabel: statusToLabel(status),
    advancePaid,
    balanceDue,
    paymentStatus: status === 'DELIVERED' ? 'paid' : 'advance_paid',
    placedAt: createdAtIso,
    createdAt: createdAtIso,
    expectedDelivery: deliveryDate.toISOString(),
    expectedDeliveryLabel: `Expected by ${deliveryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
    milestones,
    product: product ? {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
    } : undefined,
  };
}

export class OrderService {
  /**
   * Converts an accepted B2BInquiry into an Order.
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

    const unitPrice = inquiry.targetPrice ?? product.price ?? 0;
    const totalAmount = Math.round(unitPrice * inquiry.quantity * 100) / 100;

    const order = await db.orm.public.Order.create({
      buyerId: inquiry.buyerId,
      artisanId: inquiry.artisanId,
      productId: inquiry.productId,
      quantity: inquiry.quantity,
      totalAmount,
      status: 'CONFIRMED',
    });

    return decorateOrder(order);
  }

  /**
   * POST /api/orders — Buyer directly places an order for a product.
   */
  async createForBuyer(buyerId: number, input: {
    productId: number;
    quantity: number;
    deliveryAddress?: string;
    notes?: string;
  }) {
    if (!input.productId) throw new HttpError(400, 'productId is required.');
    if (!input.quantity || input.quantity <= 0) throw new HttpError(400, 'quantity must be at least 1.');

    const product = await db.orm.public.Product.where({ id: input.productId }).first();
    if (!product) throw new HttpError(404, 'Product not found.');

    const unitPrice = product.price ?? 0;
    const totalAmount = Math.round(unitPrice * input.quantity * 100) / 100;

    // Deduct stock if available
    if (product.quantity >= input.quantity) {
      await db.orm.public.Product.where({ id: product.id }).update({
        quantity: product.quantity - input.quantity,
      });
    }

    const order = await db.orm.public.Order.create({
      buyerId,
      artisanId: product.artisanId,
      productId: product.id,
      quantity: input.quantity,
      totalAmount,
      status: 'CONFIRMED',
    });

    return decorateOrder(order);
  }

  /** GET /api/orders/buyer — orders placed by this buyer. */
  async listForBuyer(buyerId: number) {
    const orders = await db.orm.public.Order.where({ buyerId })
      .include('product', (p) => p)
      .all();
    return Promise.all(orders.map(decorateOrder));
  }

  /** GET /api/orders — every order against any of my products (Artisan). */
  async listForArtisan(userId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);
    const orders = await db.orm.public.Order.where({ artisanId })
      .include('product', (p) => p)
      .all();
    return Promise.all(orders.map(decorateOrder));
  }

  /** GET /api/orders/:id — accessible by either the artisan or the buyer. */
  async getOne(userId: number, orderId: number) {
    const order = await db.orm.public.Order.where({ id: orderId })
      .include('product', (p) => p)
      .all()
      .first();
    if (!order) throw new HttpError(404, 'Order not found.');

    const artisan = await db.orm.public.Artisan.where({ userId }).all().first();
    const isArtisan = artisan && artisan.id === order.artisanId;
    const isBuyer = order.buyerId === userId;

    if (!isArtisan && !isBuyer) {
      throw new HttpError(403, 'You do not have permission to view this order.');
    }

    return decorateOrder(order);
  }

  /** PATCH /api/orders/:id/status — move an order through fulfillment lifecycle. */
  async updateStatus(userId: number, orderId: number, status: OrderStatus) {
    const artisanId = await artisanService.requireArtisanId(userId);
    const order = await db.orm.public.Order.where({ id: orderId }).first();
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.artisanId !== artisanId) throw new HttpError(403, 'You do not own this order.');

    const upperStatus = status.toUpperCase();
    await db.orm.public.Order.where({ id: orderId }).update({ status: upperStatus });
    const updated = await db.orm.public.Order.where({ id: orderId })
      .include('product', (p) => p)
      .first();
    return decorateOrder(updated);
  }
}

export const orderService = new OrderService();
