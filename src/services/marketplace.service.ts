import QRCode from 'qrcode';
import { db } from '../prisma/db';
import { r2 } from '../lib/r2';
import { encryptToken, decryptToken } from '../lib/crypto';
import { HttpError } from '../lib/http-error';
import { nowInstant, toInstant } from '../lib/temporal';
import { marketplacePublishQueue } from '../jobs/queues';
import { getAdapter, isMarketplace } from '../modules/marketplace/marketplace.registry';
import type { Marketplace, MarketplaceProduct } from '../modules/marketplace/marketplace.types';
import { env } from '../config/env';

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
  return {
    id: raw.id,
    artisanId: raw.artisanId,
    name: raw.name,
    description: raw.description,
    material: raw.material,
    category: raw.category,
    price: raw.price,
    quantity: raw.quantity,
    status: raw.status,
    createdAt: raw.createdAt,
    images: raw.images ?? [],
    catalogue: raw.catalogue ?? null,
    pricing: raw.pricing ?? null,
    // Convenience aliases the storefront consumer expects:
    imageUrl: squareUrl,
    originalImageUrl: originalUrl,
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

  async updateInquiryStatus(id: number, status: 'ACCEPTED' | 'DECLINED' | 'COMPLETED') {
    const existing = await db.orm.public.B2BInquiry.where({ id }).all().first();
    if (!existing) throw new HttpError(404, 'Inquiry not found.');
    await db.orm.public.B2BInquiry.where({ id }).update({ status });
    return { id, status };
  }

  // ------------------------------------------------------------------
  // Publish Everywhere
  // ------------------------------------------------------------------

  async publishToMarketplaces(productId: number, marketplaces: Marketplace[]) {
    if (!marketplaces.length) throw new HttpError(400, 'No marketplaces specified.');

    const product = await db.orm.public.Product.where({ id: productId }).all().first();
    if (!product) throw new HttpError(404, 'Product not found.');

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

      // Enqueue BullMQ job
      await marketplacePublishQueue.add(
        `publish:${mp}:${productId}`,
        { productId, marketplace: mp },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

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
