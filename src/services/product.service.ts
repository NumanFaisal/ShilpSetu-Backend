import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';
import { artisanService } from './artisan.service';
import { r2 } from '../lib/r2';
import type { CreateProductInput, UpdateProductInput } from '../modules/product/product.types';

async function resolveImageUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith('http://') || key.startsWith('https://')) return key;
  try {
    return await r2.getAccessUrl(key);
  } catch (err) {
    console.warn('[ProductService] Failed to get signed URL for', key, err);
    return null;
  }
}

export class ProductService {
  /** POST /api/products */
  async create(userId: number, input: CreateProductInput) {
    const artisanId = await artisanService.requireArtisanId(userId);

    const product = await db.orm.public.Product.create({
      artisanId,
      name: input.name,
      category: input.category ?? null,
      material: input.material ?? null,
      description: input.description ?? null,
      price: input.price ?? null,
      quantity: input.quantity ?? 0,
      status: 'draft',
    });

    // Link images provided by input or find recently created unlinked images for this user
    if (input.images && input.images.length > 0) {
      for (const imgItem of input.images) {
        if (!imgItem) continue;
        const uuidMatches = String(imgItem).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
        let linked = false;
        if (uuidMatches && uuidMatches.length > 0) {
          for (const candidateId of uuidMatches) {
            const existing = await db.orm.public.ProductImage.where({ id: candidateId }).all().first();
            if (existing) {
              await db.orm.public.ProductImage.where({ id: candidateId }).update({ productId: product.id });
              linked = true;
              break;
            }
          }
        }
        if (!linked && (imgItem.startsWith('http') || imgItem.includes('shilpsetu/'))) {
          const byKey = await db.orm.public.ProductImage.where({ outputSquareKey: imgItem }).all().first();
          if (byKey) {
            await db.orm.public.ProductImage.where({ id: byKey.id }).update({ productId: product.id });
          }
        }
      }
    }

    // If still no images linked to this product, link any unlinked batches created by this user
    const linkedImages = await db.orm.public.ProductImage.where({ productId: product.id }).all();
    if (linkedImages.length === 0) {
      const batches = await db.orm.public.ImageBatch.where({ userId }).all();
      for (const b of batches) {
        const unlinked = await db.orm.public.ProductImage.where({ batchId: b.id, productId: null }).all();
        for (const un of unlinked) {
          await db.orm.public.ProductImage.where({ id: un.id }).update({ productId: product.id });
        }
        if (unlinked.length > 0) break;
      }
    }

    return this.getOwned(userId, product.id);
  }

  /** GET /api/products — all of "my" products, with everything wired to them. */
  async listMine(userId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);
    const rows = await db.orm.public.Product.where({ artisanId })
      .include('images', (img) => img)
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('marketplaceListings', (m) => m)
      .include('inquiries', (i) => i)
      .all();

    return Promise.all(
      rows.map(async (p: any) => {
        const imageKeys = (p.images ?? []).map((img: any) => img.outputSquareKey || img.originalKey).filter(Boolean);
        const resolvedUrls = (
          await Promise.all(imageKeys.map((k: string) => resolveImageUrl(k)))
        ).filter(Boolean) as string[];

        return {
          ...p,
          images: resolvedUrls,
          views: 342,
          inquiries: (p.inquiries ?? []).length,
        };
      })
    );
  }

  /** Shared ownership check used by get/update/delete/publish. */
  async getOwned(userId: number, productId: number) {
    const artisanId = await artisanService.requireArtisanId(userId);

    const product: any = await db.orm.public.Product.where({ id: productId })
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

    const imageKeys = (product.images ?? []).map((img: any) => img.outputSquareKey || img.originalKey).filter(Boolean);
    const resolvedUrls = (
      await Promise.all(imageKeys.map((k: string) => resolveImageUrl(k)))
    ).filter(Boolean) as string[];

    return {
      ...product,
      images: resolvedUrls,
      views: 342,
      inquiries: (product.inquiries ?? []).length,
    };
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
