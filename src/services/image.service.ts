import { randomUUID } from 'crypto';
import { r2 } from '../lib/r2';
import { db } from '../prisma/db';
import { imageProcessingQueue } from '../jobs/queues';
import { imagePipeline } from '../jobs/pipeline';
import type { ImageJobData } from '../jobs/queues';
import type { CreateBatchInput } from '../modules/image/image.types';

const ALLOWED_STYLES = [
  'white_studio',
  'wooden_surface',
  'marble_surface',
  'luxury',
];

export class ImageService {
  // ──────────────────────────────────────────────
  //  Direct multipart upload path
  // ──────────────────────────────────────────────

  /**
   * Handles direct file upload: saves files to R2, creates DB records,
   * and enqueues background processing jobs.
   */
  async createBatchWithFiles(
    userId: number,
    files: Express.Multer.File[],
    options: { style?: string; productId?: number }
  ) {
    const style = ALLOWED_STYLES.includes(options.style || '') ? options.style! : 'white_studio';

    // Create the batch record
    const batch = await db.orm.public.ImageBatch.create({
      userId,
      style,
      productId: options.productId ?? null,
      status: 'PROCESSING',
      totalImages: files.length,
    });

    const enqueuedImages: { imageId: string; storageKey: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const imageId = randomUUID();
      const ext = this.getExtension(file.mimetype);
      const storageKey = `shilpsetu/users/${userId}/batches/${batch.id}/originals/${imageId}.${ext}`;

      // Upload original to R2
      await r2.uploadObject(storageKey, file.buffer, file.mimetype);

      // Create ProductImage record
      await db.orm.public.ProductImage.create({
        id: imageId,
        batchId: batch.id,
        productId: options.productId ?? null,
        originalKey: storageKey,
        status: 'QUEUED',
        currentStep: 'QUEUED',
        progress: 0,
      });

      // Enqueue processing job for BullMQ
      const jobData = this.buildJobData({
        batchId: batch.id,
        imageId,
        userId,
        originalKey: storageKey,
        style,
        productId: options.productId,
      });

      try {
        await Promise.race([
          imageProcessingQueue.add(
            `process-${batch.id}-${imageId}`,
            jobData,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis enqueue timeout')), 1200)
          ),
        ]);
      } catch (queueErr: any) {
        console.warn('[ImageService] Redis queue warning (fallback to direct processing):', queueErr?.message);
      }

      // Execute directly in background to guarantee real-time studio processing
      imagePipeline.processImage(jobData).catch((pipelineErr) => {
        console.error('[ImageService] Direct pipeline execution error:', pipelineErr);
      });

      enqueuedImages.push({ imageId, storageKey });
    }

    return {
      batchId: batch.id,
      status: 'PROCESSING',
      totalImages: files.length,
      images: enqueuedImages,
    };
  }

  // ──────────────────────────────────────────────
  //  Presigned upload session path
  // ──────────────────────────────────────────────

  /**
   * Creates a batch and generates presigned R2 upload URLs for client-side upload.
   */
  async createBatchSession(userId: number, input: CreateBatchInput) {
    const style = input.style || 'white_studio';

    const batch = await db.orm.public.ImageBatch.create({
      userId,
      style,
      productId: input.productId ?? null,
      status: 'PENDING',
      totalImages: input.imageCount,
    });

    const images: { imageId: string; uploadUrl: string; objectKey: string }[] = [];

    for (let i = 0; i < input.imageCount; i++) {
      const imageId = randomUUID();
      const objectKey = `shilpsetu/users/${userId}/batches/${batch.id}/originals/${imageId}.jpg`;

      // Create ProductImage placeholder record
      await db.orm.public.ProductImage.create({
        id: imageId,
        batchId: batch.id,
        productId: input.productId ?? null,
        originalKey: objectKey,
        status: 'PENDING',
        currentStep: 'PENDING',
        progress: 0,
      });

      const uploadUrl = await r2.createPresignedUploadUrl(objectKey, 'image/jpeg', 3600);

      images.push({ imageId, uploadUrl, objectKey });
    }

    return {
      batchId: batch.id,
      style,
      images,
    };
  }

  /**
   * Verifies all original images exist in R2 and enqueues processing jobs.
   */
  async completeBatchUpload(batchId: string, userId: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');
    if (batch.userId !== userId) throw new Error('Unauthorized');

    const images = await db.orm.public.ProductImage.where({ batchId }).all();

    let enqueuedCount = 0;

    for (const image of images) {
      if (image.status !== 'PENDING') continue;

      const exists = await r2.objectExists(image.originalKey);
      if (!exists) {
        await db.orm.public.ProductImage.where({ id: image.id }).update({
          status: 'FAILED',
          error: 'Original file not found in storage',
        });
        continue;
      }

      await db.orm.public.ProductImage.where({ id: image.id }).update({
        status: 'QUEUED',
        currentStep: 'QUEUED',
        progress: 0,
      });

      try {
        await Promise.race([
          imageProcessingQueue.add(
            `process-${batchId}-${image.id}`,
            this.buildJobData({
              batchId,
              imageId: image.id,
              userId,
              originalKey: image.originalKey,
              style: batch.style,
              productId: batch.productId ?? undefined,
            }),
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis enqueue timeout')), 1200)
          ),
        ]);
      } catch (queueErr: any) {
        console.warn('[ImageService] Redis queue warning:', queueErr?.message);
      }

      enqueuedCount++;
    }

    await db.orm.public.ImageBatch.where({ id: batchId }).update({
      status: 'PROCESSING',
    });

    return {
      batchId,
      status: 'PROCESSING',
      enqueuedImages: enqueuedCount,
    };
  }

  
  //  Query methods

  async getBatchDetails(batchId: string, userId?: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');

    const images = await db.orm.public.ProductImage.where({ batchId }).all();

    const imagesWithUrls = await Promise.all(
      images.map(async (img) => ({
        imageId: img.id,
        status: img.status,
        currentStep: img.currentStep,
        progress: img.progress,
        error: img.error,
        validationScore: img.validationScore,
        outputs: {
          square: img.outputSquareKey
            ? await r2.getAccessUrl(img.outputSquareKey)
            : img.lightingKey
            ? await r2.getAccessUrl(img.lightingKey)
            : img.studioKey
            ? await r2.getAccessUrl(img.studioKey)
            : null,
          portrait: img.outputPortraitKey ? await r2.getAccessUrl(img.outputPortraitKey) : null,
          landscape: img.outputLandscapeKey ? await r2.getAccessUrl(img.outputLandscapeKey) : null,
        },
      }))
    );

    return {
      batchId: batch.id,
      status: batch.status,
      style: batch.style,
      totalImages: batch.totalImages,
      completedImages: batch.completedImages,
      failedImages: batch.failedImages,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      images: imagesWithUrls,
    };
  }

  async cancelBatch(batchId: string, userId: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');
    if (batch.userId !== userId) throw new Error('Unauthorized');

    // Cancel queued jobs
    const images = await db.orm.public.ProductImage.where({ batchId }).all();
    for (const img of images) {
      if (img.status === 'QUEUED' || img.status === 'PENDING') {
        await db.orm.public.ProductImage.where({ id: img.id }).update({
          status: 'CANCELLED',
        });
      }
    }

    await db.orm.public.ImageBatch.where({ id: batchId }).update({
      status: 'CANCELLED',
    });

    return { batchId, status: 'CANCELLED' };
  }

  async retryImage(batchId: string, imageId: string, userId: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');
    if (batch.userId !== userId) throw new Error('Unauthorized');

    const image = await db.orm.public.ProductImage.where({ id: imageId }).first();
    if (!image || image.batchId !== batchId) throw new Error('Image not found in this batch');
    if (image.status !== 'FAILED') throw new Error('Only failed images can be retried');

    await db.orm.public.ProductImage.where({ id: imageId }).update({
      status: 'QUEUED',
      currentStep: 'VALIDATION',
      progress: 0,
      error: null,
    });

    await imageProcessingQueue.add(
      `retry-${batchId}-${imageId}`,
      this.buildJobData({
        batchId,
        imageId,
        userId,
        originalKey: image.originalKey,
        style: batch.style,
        productId: batch.productId ?? undefined,
        isRetry: true,
      }),
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );

    return { imageId, status: 'QUEUED' };
  }

  async getImageDetails(batchId: string, imageId: string, userId: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');
    if (batch.userId !== userId) throw new Error('Unauthorized');

    const image = await db.orm.public.ProductImage.where({ id: imageId }).first();
    if (!image || image.batchId !== batchId) throw new Error('Image not found');

    const versions = await db.orm.public.ImageVersion.where({ imageId }).all();

    const versionsWithUrls = await Promise.all(
      versions.map(async (v) => ({
        step: v.processingStep,
        storageKey: v.storageKey,
        format: v.format,
        width: v.width,
        height: v.height,
        url: await r2.getAccessUrl(v.storageKey),
      }))
    );

    return {
      imageId: image.id,
      status: image.status,
      currentStep: image.currentStep,
      progress: image.progress,
      error: image.error,
      analysis: image.analysis ? JSON.parse(image.analysis) : null,
      boundingBox: image.boundingBox ? JSON.parse(image.boundingBox) : null,
      validationScore: image.validationScore,
      outputs: {
        square: image.outputSquareKey ? await r2.getAccessUrl(image.outputSquareKey) : null,
        portrait: image.outputPortraitKey ? await r2.getAccessUrl(image.outputPortraitKey) : null,
        landscape: image.outputLandscapeKey ? await r2.getAccessUrl(image.outputLandscapeKey) : null,
      },
      versions: versionsWithUrls,
    };
  }

  async getImageDownloadUrls(batchId: string, imageId: string, userId: number) {
    const batch = await db.orm.public.ImageBatch.where({ id: batchId }).first();
    if (!batch) throw new Error('Batch not found');
    if (batch.userId !== userId) throw new Error('Unauthorized');

    const image = await db.orm.public.ProductImage.where({ id: imageId }).first();
    if (!image || image.batchId !== batchId) throw new Error('Image not found');

    if (image.status !== 'COMPLETED') {
      throw new Error('Image processing not yet complete');
    }

    return {
      square: image.outputSquareKey ? await r2.getAccessUrl(image.outputSquareKey, 7200) : null,
      portrait: image.outputPortraitKey ? await r2.getAccessUrl(image.outputPortraitKey, 7200) : null,
      landscape: image.outputLandscapeKey ? await r2.getAccessUrl(image.outputLandscapeKey, 7200) : null,
    };
  }

  // ──────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────

  /**
   * Builds an ImageJobData object, conditionally including optional fields
   * to satisfy exactOptionalPropertyTypes.
   */
  private buildJobData(data: {
    batchId: string;
    imageId: string;
    userId: number;
    originalKey: string;
    style: string;
    productId?: number | undefined;
    isRetry?: boolean;
  }): ImageJobData {
    const job: ImageJobData = {
      batchId: data.batchId,
      imageId: data.imageId,
      userId: data.userId,
      originalKey: data.originalKey,
      style: data.style,
    };
    if (data.productId !== undefined) job.productId = data.productId;
    if (data.isRetry) job.isRetry = data.isRetry;
    return job;
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[mimeType] || 'jpg';
  }
}

export const imageService = new ImageService();
