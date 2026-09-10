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
      // Atomic claim: only claim and transition if status is currently QUEUED or PENDING
      const claimed = await db.orm.public.ProductImage
        .where((img) => img.id.eq(job.data.imageId))
        .where((img) => img.status.in(['QUEUED', 'PENDING']))
        .update({
          status: 'PROCESSING',
        });

      if (!claimed) {
        console.log(
          `[Worker] Image ${job.data.imageId} already claimed or completed. Skipping redundant processing for job ${job.id}.`
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
      concurrency: 4,
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
