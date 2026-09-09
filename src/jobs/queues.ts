import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis';

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
  // 5 attempts: waits 5s → 10s → 20s → 40s between retries.
  // Gives transient R2 502/ECONNRESET errors enough time to recover.
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s, 10s, 20s, 40s
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600, // 7 days
  },
};

export const imageProcessingQueue = new Queue<ImageJobData>(
  IMAGE_PROCESSING_QUEUE_NAME,
  {
    connection: createRedisConnection(),
    defaultJobOptions,
  }
);


// Marketplace publish queue ("Publish Everywhere")


export interface MarketplacePublishJobData {
  productId: number;
  marketplace: string; // Marketplace union type
}

export const MARKETPLACE_PUBLISH_QUEUE_NAME = 'marketplace-publish';

export const marketplacePublishQueue = new Queue<MarketplacePublishJobData>(
  MARKETPLACE_PUBLISH_QUEUE_NAME,
  {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);
