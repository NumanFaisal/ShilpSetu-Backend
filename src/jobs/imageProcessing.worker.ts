import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { IMAGE_PROCESSING_QUEUE_NAME, type ImageJobData } from './queues';
import { imagePipeline } from './pipeline';

/**
 * BullMQ worker that processes the image-processing queue.
 * Runs the full product studio pipeline (validation → background
 * removal → studio reconstruction → export) for each image.
 */
import { db } from '../prisma/db';

export function startImageProcessingWorker() {
  const worker = new Worker<ImageJobData>(
    IMAGE_PROCESSING_QUEUE_NAME,
    async (job) => {
      // Safe check: skip only if already completed
      const existing = await db.orm.public.ProductImage.where({ id: job.data.imageId }).first();
      if (!existing || existing.status === 'COMPLETED') {
        console.log(
          `[Worker] Image ${job.data.imageId} is already completed. Skipping redundant execution for job ${job.id}.`
        );
        return;
      }

      console.log(
        `[Worker] Processing job ${job.id} — batch=${job.data.batchId}, image=${job.data.imageId}`
      );
      await imagePipeline.processImage(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 8,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] ✅ Job ${job.id} completed.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed:`, err.message);
  });

  let lastErrorTime = 0;
  worker.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorTime > 15000) {
      console.warn('[Worker] Worker connection issue (Redis):', err.message);
      lastErrorTime = now;
    }
  });

  console.log('[Worker] 🚀 Image processing worker started.');
  return worker;
}
