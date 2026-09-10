import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';
import { artisanService } from './artisan.service';
import type { CreateProductInput, UpdateProductInput } from '../modules/product/product.types';

export class ProductService {
  /** POST /api/products */
  async create(userId: number, input: CreateProductInput) {
    const artisanId = await artisanService.requireArtisanId(userId);

    return db.orm.public.Product.create({
      artisanId,
      name: input.name,
      category: input.category ?? null,
      material: input.material ?? null,
      description: input.description ?? null,
      price: input.price ?? null,
      quantity: input.quantity ?? 0,
      status: 'draft',
    });
  }

  /** GET /api/products — all of "my" products, with everything wired to them. */
  async listMine(userId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);
    return db.orm.public.Product.where({ artisanId })
      .include('images', (img) => img)
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('marketplaceListings', (m) => m)
      .all();
  }

  /** Shared ownership check used by get/update/delete/publish. */
  async getOwned(userId: number, productId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);

    const product = await db.orm.public.Product.where({ id: productId })
      .include('images', (img) => img)
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('marketplaceListings', (m) => m)
      .include('inquiries', (i) => i)
      .all()
      .first();

    if (!product) throw new HttpError(404, 'Product not found.');
    if (product.artisanId !== artisanId) {
      throw new HttpError(403, 'You do not own this product.');
    }
    return product;
  }

  /** GET /api/products/:id */
  async getOne(userId: number, productId: number) {
    return this.getOwned(userId, productId);
  }

  /** PATCH /api/products/:id */
  async update(userId: number, productId: number, input: UpdateProductInput) {
    const product: any = await this.getOwned(userId, productId);

    if (input.status === 'published') {
      const hasFinishedImage = (product.images ?? []).some((img: any) => img.status === 'COMPLETED');
      if (!hasFinishedImage) {
        throw new HttpError(
          400,
          'This product needs at least one completed AI Product Studio image before it can be published.'
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.material !== undefined) patch.material = input.material;
    if (input.description !== undefined) patch.description = input.description;
    if (input.price !== undefined) patch.price = input.price;
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.status !== undefined) patch.status = input.status;

    if (Object.keys(patch).length > 0) {
      await db.orm.public.Product.where({ id: productId }).update(patch as any);
    }
    return db.orm.public.Product.where({ id: productId }).first();
  }

  /**
   * DELETE /api/products/:id — implemented as a soft delete (status →
   * "archived") rather than a hard row delete. Products can be referenced by
   * ImageBatch/ProductImage/Catalogue/Pricing/MarketplaceListing/Order rows,
   * and this codebase's ORM contract has no cascade-delete configured for
   * those foreign keys, so a hard delete would either fail on the FK or
   * silently orphan child rows. Archiving keeps history intact and is safe
   * to call from admin tooling later if a real hard-delete is ever needed.
   */
  async archive(userId: number, productId: number) {
    await this.getOwned(userId, productId);
    await db.orm.public.Product.where({ id: productId }).update({ status: 'archived' });
    return { archived: true, productId };
  }
}

export const productService = new ProductService();
