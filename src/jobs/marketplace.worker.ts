import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { nowInstant } from '../lib/temporal';
import { db } from '../prisma/db';
import { getAdapter } from '../modules/marketplace/marketplace.registry';
import type { MarketplaceProduct } from '../modules/marketplace/marketplace.types';
import type { MarketplacePublishJobData } from './queues';
import { r2 } from '../lib/r2';

let worker: Worker | null = null;

export function startMarketplacePublishWorker() {
  if (worker) return worker;

  worker = new Worker<MarketplacePublishJobData>(
    'marketplace-publish',
    async (job) => {
      const { productId, marketplace } = job.data;
      console.log(`[marketplace-worker] Processing publish: product=${productId} marketplace=${marketplace}`);

      const adapter = getAdapter(marketplace as any);

      // Load product with relations
      const product = await db.orm.public.Product.where({ id: productId })
        .include('catalogue', (c) => c)
        .include('pricing', (p) => p)
        .include('images', (img) => img)
        .all()
        .first();

      if (!product) throw new Error(`Product ${productId} not found`);

      // Resolve image URLs for adapter
      const images = await Promise.all(
        (product.images ?? []).map(async (img: any) => ({
          ...img,
          outputSquareUrl: img.outputSquareKey ? await r2.getAccessUrl(img.outputSquareKey) : null,
          originalUrl: img.originalKey ? await r2.getAccessUrl(img.originalKey) : null,
        })),
      );

      const marketplaceProduct: MarketplaceProduct = {
        id: product.id,
        name: product.name,
        description: product.description,
        material: product.material,
        category: product.category,
        price: product.price,
        quantity: product.quantity,
        status: product.status,
        catalogue: (product as any).catalogue ?? null,
        pricing: (product as any).pricing ?? null,
        images,
      };

      const { externalId } = await adapter.createListing(marketplaceProduct);

      // Update listing row
      const listing = await db.orm.public.MarketplaceListing
        .where({ productId, marketplace })
        .all()
        .first();

      if (listing) {
        await db.orm.public.MarketplaceListing.where({ id: listing.id }).update({
          externalId,
          status: 'PUBLISHED',
          lastSyncedAt: nowInstant(),
          errorMessage: null,
        });
      }

      console.log(`[marketplace-worker] Published product=${productId} → ${marketplace} (externalId=${externalId})`);
      return { externalId };
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    console.error(`[marketplace-worker] Job ${job?.id} failed: ${err.message}`);

    if (job) {
      const { productId, marketplace } = job.data;
      const listing = await db.orm.public.MarketplaceListing
        .where({ productId, marketplace })
        .all()
        .first();

      if (listing) {
        await db.orm.public.MarketplaceListing.where({ id: listing.id }).update({
          status: 'FAILED',
          errorMessage: err.message.slice(0, 500),
        });
      }
    }
  });

  worker.on('completed', (job) => {
    console.log(`[marketplace-worker] Job ${job.id} completed`);
  });

  let lastErrorTime = 0;
  worker.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorTime > 15000) {
      console.warn('[marketplace-worker] Redis connection issue:', err.message);
      lastErrorTime = now;
    }
  });

  console.log('[marketplace-worker] Started');

  return worker;
}
