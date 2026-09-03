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
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
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
