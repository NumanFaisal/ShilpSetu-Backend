import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { IMAGE_PROCESSING_QUEUE_NAME, type ImageJobData } from './queues';
import { imagePipeline } from './pipeline';

/**
 * BullMQ worker that processes the image-processing queue.
 * Runs the full product studio pipeline (validation → background
 * removal → studio reconstruction → export) for each image.
 */
export function startImageProcessingWorker() {
  const worker = new Worker<ImageJobData>(
    IMAGE_PROCESSING_QUEUE_NAME,
    async (job) => {
      console.log(
        `[Worker] Processing job ${job.id} — batch=${job.data.batchId}, image=${job.data.imageId}`
      );
      await imagePipeline.processImage(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 4,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] ✅ Job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
  });

  console.log('[Worker] 🚀 Image processing worker started.');
  return worker;
}
