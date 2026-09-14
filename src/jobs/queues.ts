import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { env } from '../config/env';

export interface ImageJobData {
  batchId: string;
  imageId: string;
  userId: number;
  productId?: number;
  originalKey: string;
  style?: string;
  resumeFromStep?: string;
  isRetry?: boolean;
}

export const IMAGE_PROCESSING_QUEUE_NAME = 'image-processing';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600,
  },
};

let _imageProcessingQueue: Queue<ImageJobData> | null = null;

export function getImageProcessingQueue(): Queue<ImageJobData> | null {
  if (!env.ENABLE_REDIS) return null;
  if (!_imageProcessingQueue) {
    _imageProcessingQueue = new Queue<ImageJobData>(
      IMAGE_PROCESSING_QUEUE_NAME,
      {
        connection: createRedisConnection(),
        defaultJobOptions,
      }
    );
  }
  return _imageProcessingQueue;
}

export const imageProcessingQueue = env.ENABLE_REDIS ? getImageProcessingQueue() : null;

// Marketplace publish queue ("Publish Everywhere")
export interface MarketplacePublishJobData {
  productId: number;
  marketplace: string;
}

export const MARKETPLACE_PUBLISH_QUEUE_NAME = 'marketplace-publish';

let _marketplacePublishQueue: Queue<MarketplacePublishJobData> | null = null;

export function getMarketplacePublishQueue(): Queue<MarketplacePublishJobData> | null {
  if (!env.ENABLE_REDIS) return null;
  if (!_marketplacePublishQueue) {
    _marketplacePublishQueue = new Queue<MarketplacePublishJobData>(
      MARKETPLACE_PUBLISH_QUEUE_NAME,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      },
    );
  }
  return _marketplacePublishQueue;
}

export const marketplacePublishQueue = env.ENABLE_REDIS ? getMarketplacePublishQueue() : null;

/**
 * Unified dispatchers that gracefully route between BullMQ (Redis) and In-Memory asynchronous execution.
 */
export async function enqueueImageJob(data: ImageJobData): Promise<void> {
  if (env.ENABLE_REDIS) {
    const queue = getImageProcessingQueue();
    if (queue) {
      await queue.add(`process-${data.batchId}-${data.imageId}`, data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
      return;
    }
  }

  // In-memory fallback / direct execution
  setImmediate(async () => {
    try {
      console.log(`[in-memory-queue] 🖼️  Processing image job: batch=${data.batchId}, image=${data.imageId}`);
      const { imagePipeline } = await import('./pipeline');
      await imagePipeline.processImage(data);
    } catch (err: any) {
      console.error(`[in-memory-queue] ❌ Image processing failed for ${data.imageId}:`, err?.message || err);
    }
  });
}

export async function enqueueMarketplacePublishJob(data: MarketplacePublishJobData): Promise<void> {
  if (env.ENABLE_REDIS) {
    const queue = getMarketplacePublishQueue();
    if (queue) {
      await queue.add(
        `publish:${data.marketplace}:${data.productId}`,
        data,
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
      );
      return;
    }
  }

  // In-memory fallback / direct execution
  setImmediate(async () => {
    try {
      console.log(`[in-memory-queue] 🛒 Processing marketplace publish: product=${data.productId} → ${data.marketplace}`);
      const { processMarketplacePublishJob } = await import('./marketplace.worker');
      await processMarketplacePublishJob(data);
    } catch (err: any) {
      console.error(`[in-memory-queue] ❌ Marketplace publish failed for product=${data.productId}:`, err?.message || err);
    }
  });
}

