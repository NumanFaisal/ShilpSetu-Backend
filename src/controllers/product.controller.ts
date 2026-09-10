import type { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';
import { createProductSchema, updateProductSchema } from '../modules/product/product.types';

function parseId(raw: string | undefined, label = 'id'): number {
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) {
    const err: any = new Error(`Invalid ${label}.`);
    err.status = 400;
    throw err;
  }
  return id;
}

export class ProductController {
  /** POST /api/products */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const input = createProductSchema.parse(req.body);
      const product = await productService.create(userId, input);
      res.status(201).json({ message: 'Product created as a draft.', product });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/products */
  async listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const products = await productService.listMine(userId);
      res.json({ products });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/products/:id */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const productId = parseId(req.params['id'] as string, 'product id');
      const product = await productService.getOne(userId, productId);
      res.json(product);
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/products/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const productId = parseId(req.params['id'] as string, 'product id');
      const input = updateProductSchema.parse(req.body);
      const product = await productService.update(userId, productId, input);
      res.json({ message: 'Product updated.', product });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/products/:id (soft delete → status "archived").
   * To put a product on your storefront, use PATCH /api/products/:id
   * with { "status": "published" } instead — see product.types.ts.
   */
  async archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const productId = parseId(req.params['id'] as string, 'product id');
      const result = await productService.archive(userId, productId);
      res.json({ message: 'Product archived.', ...result });
    } catch (err) {
      next(err);
    }
  }
}

export const productController = new ProductController();
