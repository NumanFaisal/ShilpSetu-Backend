import QRCode from 'qrcode';
import { db } from '../prisma/db';
import { r2 } from '../lib/r2';
import { encryptToken, decryptToken } from '../lib/crypto';
import { HttpError } from '../lib/http-error';
import { nowInstant, toInstant } from '../lib/temporal';
import { enqueueMarketplacePublishJob } from '../jobs/queues';
import { getAdapter, isMarketplace } from '../modules/marketplace/marketplace.registry';
import type { Marketplace, MarketplaceProduct } from '../modules/marketplace/marketplace.types';
import { env } from '../config/env';
// NEW: converts an accepted inquiry into a real Order (see updateInquiryStatus below).
import { orderService } from './order.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the full public image URL for a ProductImage row (if an output key exists). */
async function imageUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  return r2.getAccessUrl(key);
}

/** Strip nulls and decorate raw Product rows with image URLs + relations. */
async function decorateProduct(raw: any) {
  const [squareUrl, originalUrl] = await Promise.all([
    imageUrl(raw.images?.[0]?.outputSquareKey),
    imageUrl(raw.images?.[0]?.originalKey),
  ]);

  const resolvedImages: string[] = [];
  if (raw.images && Array.isArray(raw.images)) {
    for (const img of raw.images) {
      const u = await imageUrl(img.outputSquareKey || img.originalKey);
      if (u) resolvedImages.push(u);
    }
  }
  if (resolvedImages.length === 0) {
    resolvedImages.push(
      squareUrl ||
      originalUrl ||
      'https://images.unsplash.com/photo-1590736704728-f4730bb30770?w=600'
    );
  }

  const artisan = await db.orm.public.Artisan.where({ id: raw.artisanId })
    .include('user', (u) => u)
    .all()
    .first();

  const artisanName = artisan?.storeName ?? artisan?.user?.name ?? 'Master Artisan';
  const artisanLocation = artisan?.location ?? (artisan?.district ? `${artisan.district}, ${artisan.state}` : 'India');
  const artisanExperience = artisan?.experience ?? 8;
  const craftType = artisan?.craftType ?? raw.category ?? 'Handicrafts';

  return {
    id: raw.id,
    artisanId: raw.artisanId,
    name: raw.name,
    description: raw.description,
    aiDescription: raw.catalogue?.descriptionEn ?? raw.description ?? 'Authentic handcrafted piece crafted by master artisans.',
    material: raw.material ?? 'Natural Fiber',
    category: raw.category ?? 'Handicrafts',
    craftType,
    origin: artisanLocation,
    size: '12 × 10 inches',
    weight: '450 grams',
    moq: 10,
    price: raw.price ?? 0,
    mrp: Math.round((raw.price ?? 1000) * 1.35),
    quantity: raw.quantity,
    status: raw.status,
    createdAt: raw.createdAt,
    images: resolvedImages,
    certifications: ['Craftmark Certified', 'Handmade in India', '100% Eco-Friendly'],
    tags: [raw.category, raw.material, craftType].filter(Boolean),
    matchScore: 94,
    artisanName,
    artisanLocation,
    artisanExperience,
    catalogue: raw.catalogue ?? null,
    pricing: raw.pricing ?? null,
    // Convenience aliases the storefront consumer expects:
    imageUrl: squareUrl || resolvedImages[0],
    originalImageUrl: originalUrl || resolvedImages[0],
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class MarketplaceService {
  // ------------------------------------------------------------------
  // Public storefront
  // ------------------------------------------------------------------

  async getStorefront(slug: string) {
    const artisan = await db.orm.public.Artisan
      .where({ slug })
      .include('user', (u) => u)
      .all()
      .first();
    if (!artisan) throw new HttpError(404, 'Storefront not found.');

    // published products → include catalogue, pricing, images
    const products = await db.orm.public.Product.where({
      artisanId: artisan.id,
      status: 'published',
    })
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('images', (img) => img)
      .all();

    const decorated = await Promise.all(products.map(decorateProduct));

    return {
      artisan: {
        id: artisan.id,
        name: artisan.user?.name ?? 'Artisan',
        storeName: artisan.storeName ?? artisan.user?.name ?? 'Artisan',
        bio: artisan.bio,
        location: artisan.location,
        state: artisan.state,
        district: artisan.district,
        craftType: artisan.craftType,
        experience: artisan.experience,
      },
      products: decorated,
    };
  }

  async getStorefrontQr(slug: string) {
    // verify storefront exists
    const artisan = await db.orm.public.Artisan.where({ slug }).all().first();
    if (!artisan) throw new HttpError(404, 'Storefront not found.');

    const url = `${env.FRONTEND_URL}/storefront/${slug}`;
    return QRCode.toBuffer(url, { width: 400, margin: 2 });
  }

  // ------------------------------------------------------------------
  // Marketplace connections
  // ------------------------------------------------------------------

  async getConnections(artisanId: number) {
    const rows = await db.orm.public.MarketplaceConnection.where({ artisanId }).all();
    return rows.map((row) => ({
      ...row,
      // tokens are never exposed; just presence flags
      hasAccessToken: !!row.accessTokenEnc,
      hasRefreshToken: !!row.refreshTokenEnc,
      accessTokenEnc: undefined,
      refreshTokenEnc: undefined,
    }));
  }

  async connect(artisanId: number, marketplace: Marketplace, payload: Record<string, unknown>) {
    if (!isMarketplace(marketplace)) throw new HttpError(400, `Unknown marketplace: ${marketplace}`);

    const adapter = getAdapter(marketplace);
    const { externalSellerId } = await adapter.connect(payload);

    const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : undefined;
    const refreshToken = typeof payload.refreshToken === 'string' ? payload.refreshToken : undefined;
    const expiresAt = typeof payload.expiresAt === 'string' ? toInstant(payload.expiresAt) : undefined;
    const metadata = payload.metadata ? JSON.stringify(payload.metadata) : undefined;

    const existing = await db.orm.public.MarketplaceConnection
      .where({ artisanId, marketplace })
      .all()
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        status: 'CONNECTED',
        externalSellerId: externalSellerId ?? null,
        expiresAt: expiresAt ?? null,
        metadata: metadata ?? null,
        updatedAt: nowInstant(),
      };
      if (accessToken) patch.accessTokenEnc = encryptToken(accessToken);
      if (refreshToken) patch.refreshTokenEnc = encryptToken(refreshToken);
      await db.orm.public.MarketplaceConnection.where({ id: existing.id }).update(patch as any);
    } else {
      await db.orm.public.MarketplaceConnection.create({
        artisanId,
        marketplace,
        status: 'CONNECTED',
        externalSellerId: externalSellerId ?? null,
        accessTokenEnc: accessToken ? encryptToken(accessToken) : null,
        refreshTokenEnc: refreshToken ? encryptToken(refreshToken) : null,
        expiresAt: expiresAt ?? null,
        metadata: metadata ?? null,
        updatedAt: nowInstant(),
      });
    }

    return { connected: true, marketplace, externalSellerId };
  }

  async disconnect(artisanId: number, marketplace: Marketplace) {
    const existing = await db.orm.public.MarketplaceConnection
      .where({ artisanId, marketplace })
      .all()
      .first();
    if (!existing) throw new HttpError(404, 'Connection not found.');

    await db.orm.public.MarketplaceConnection.where({ id: existing.id }).update({
      status: 'DISCONNECTED',
      updatedAt: nowInstant(),
    });
    return { disconnected: true, marketplace };
  }

  // ------------------------------------------------------------------
  // B2B Inquiries
  // ------------------------------------------------------------------

  async createInquiry(input: {
    buyerId: number;
    artisanId: number;
    productId: number;
    quantity: number;
    targetPrice?: number;
    deliveryLocation?: string;
    requiredDate?: string;
    message?: string;
  }) {
    const row = await db.orm.public.B2BInquiry.create({
      buyerId: input.buyerId,
      artisanId: input.artisanId,
      productId: input.productId,
      quantity: input.quantity,
      targetPrice: input.targetPrice ?? null,
      deliveryLocation: input.deliveryLocation ?? null,
      requiredDate: input.requiredDate ? toInstant(input.requiredDate) : null,
      message: input.message ?? null,
      status: 'PENDING',
    });
    return row;
  }

  async listInquiries(artisanId: number) {
    return db.orm.public.B2BInquiry.where({ artisanId }).all();
  }

  /**
   * UPDATED: accepting an inquiry now actually creates the Order the app's
   * own user-journey diagram promises ("Accept / Reject / Negotiate → Order").
   * Previously this only flipped the inquiry's status and nothing else.
   */
  async updateInquiryStatus(id: number, status: 'ACCEPTED' | 'DECLINED' | 'COMPLETED') {
    const existing = await db.orm.public.B2BInquiry.where({ id }).all().first();
    if (!existing) throw new HttpError(404, 'Inquiry not found.');

    await db.orm.public.B2BInquiry.where({ id }).update({ status });

    let order = null;
    if (status === 'ACCEPTED') {
      order = await orderService.createFromInquiry({
        id: existing.id,
        buyerId: existing.buyerId,
        artisanId: existing.artisanId,
        productId: existing.productId,
        quantity: existing.quantity,
        targetPrice: existing.targetPrice,
      });
    }

    return { id, status, order };
  }

  // ------------------------------------------------------------------
  // Buyer Discovery (search + single product)
  // ------------------------------------------------------------------

  /**
   * Cross-store product search for buyers.
   * NOTE: category/state/price filtering is done in-memory after fetching all
   * published products, because the ORM's .where() only supports exact-match
   * equality. If the query builder gains range/contains support in future,
   * push those filters into the DB query instead for better perf at scale.
   */
  async searchProducts(params: {
    q?: string;
    category?: string;
    craftType?: string;
    state?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    pageSize?: number;
  }) {
    const allPublished = await db.orm.public.Product.where({ status: 'published' })
      .include('images', (img) => img)
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .all();

    let filtered = allPublished;

    if (params.q) {
      const q = params.q.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.material && p.material.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)),
      );
    }
    if (params.category) {
      const cat = params.category.toLowerCase();
      filtered = filtered.filter((p) => p.category?.toLowerCase() === cat);
    }
    if (params.minPrice !== undefined) {
      filtered = filtered.filter((p) => (p.price ?? 0) >= params.minPrice!);
    }
    if (params.maxPrice !== undefined) {
      filtered = filtered.filter((p) => (p.price ?? 0) <= params.maxPrice!);
    }
    if (params.craftType || params.state) {
      // Need artisan details — resolve lazily only for the filtered subset
      const artisanIds = [...new Set(filtered.map((p) => p.artisanId))];
      const artisans = await Promise.all(
        artisanIds.map((id) => db.orm.public.Artisan.where({ id }).all().first()),
      );
      const artisanMap = new Map(artisans.filter(Boolean).map((a) => [a!.id, a!]));

      if (params.craftType) {
        const ct = params.craftType.toLowerCase();
        filtered = filtered.filter((p) => artisanMap.get(p.artisanId)?.craftType?.toLowerCase() === ct);
      }
      if (params.state) {
        const st = params.state.toLowerCase();
        filtered = filtered.filter((p) => artisanMap.get(p.artisanId)?.state?.toLowerCase() === st);
      }
    }

    // Pagination
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    const decorated = await Promise.all(items.map(decorateProduct));
    return { total, page, pageSize, items: decorated };
  }

  /** Single published product viewable by any buyer. */
  async getPublicProduct(productId: number) {
    const product = await db.orm.public.Product.where({ id: productId })
      .include('images', (img) => img)
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .all()
      .first();
    if (!product) throw new HttpError(404, 'Product not found.');
    return decorateProduct(product);
  }

  // ------------------------------------------------------------------
  // Publish Everywhere
  // ------------------------------------------------------------------

  async publishToMarketplaces(productId: number, marketplaces: Marketplace[]) {
    if (!marketplaces.length) throw new HttpError(400, 'No marketplaces specified.');

    const product = await db.orm.public.Product.where({ id: productId }).all().first();
    if (!product) throw new HttpError(404, 'Product not found.');

    // Ensure product status is marked as published
    await db.orm.public.Product.where({ id: productId }).update({ status: 'published' });

    const results: Array<{ marketplace: string; status: string }> = [];

    for (const mp of marketplaces) {
      if (!isMarketplace(mp)) {
        results.push({ marketplace: mp, status: 'INVALID' });
        continue;
      }

      const existing = await db.orm.public.MarketplaceListing
        .where({ productId, marketplace: mp })
        .all()
        .first();

      if (existing && (existing.status === 'PUBLISHED' || existing.status === 'PENDING')) {
        results.push({ marketplace: mp, status: existing.status });
        continue;
      }

      if (existing) {
        await db.orm.public.MarketplaceListing.where({ id: existing.id }).update({
          status: 'PENDING',
          errorMessage: null,
        });
      } else {
        await db.orm.public.MarketplaceListing.create({
          productId,
          marketplace: mp,
          status: 'PENDING',
        });
      }

      // Enqueue job (routes to Redis BullMQ or In-Memory runner)
      await enqueueMarketplacePublishJob({ productId, marketplace: mp });

      results.push({ marketplace: mp, status: 'PENDING' });
    }

    return { queued: true, results };
  }

  async getProductMarketplaceStatus(productId: number) {
    return db.orm.public.MarketplaceListing.where({ productId }).all();
  }

  // ------------------------------------------------------------------
  // Schema exports (ONDC / GeM)
  // ------------------------------------------------------------------

  async exportOnDc(productId: number) {
    const product = await this._loadMarketplaceProduct(productId);
    const adapter = getAdapter('ONDC');
    return adapter.exportSchema!(product);
  }

  async exportGem(productId: number) {
    const product = await this._loadMarketplaceProduct(productId);
    const adapter = getAdapter('GEM');
    return adapter.exportSchema!(product);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async _loadMarketplaceProduct(productId: number) {
    const raw = await db.orm.public.Product.where({ id: productId })
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('images', (img) => img)
      .all()
      .first();
    if (!raw) throw new HttpError(404, 'Product not found.');

    // Resolve image URLs for the adapter
    const images = await Promise.all(
      (raw.images ?? []).map(async (img: any) => ({
        ...img,
        outputSquareUrl: img.outputSquareKey ? await r2.getAccessUrl(img.outputSquareKey) : null,
        originalUrl: img.originalKey ? await r2.getAccessUrl(img.originalKey) : null,
      })),
    );

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      material: raw.material,
      category: raw.category,
      price: raw.price,
      quantity: raw.quantity,
      status: raw.status,
      catalogue: (raw as any).catalogue ?? null,
      pricing: (raw as any).pricing ?? null,
      images,
    } as MarketplaceProduct;
  }
}

export const marketplaceService = new MarketplaceService();
