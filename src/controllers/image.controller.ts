import type { Request, Response, NextFunction } from 'express';
import { imageService } from '../services/image.service';
import { createBatchSchema } from '../modules/image/image.types';

export class ImageController {
  /**
   * Direct multipart/form-data upload (1–4 files) via POST /api/image-batches/upload.
   */
  async uploadBatchDirect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Please upload between 1 and 4 image files using form field "images"' });
        return;
      }

      const style = typeof req.body?.style === 'string' ? req.body.style : 'white_studio';
      const productId = req.body?.productId ? Number(req.body.productId) : undefined;

      const result = await imageService.createBatchWithFiles(userId, files, {
        style,
        ...(productId !== undefined ? { productId } : {}),
      });

      res.status(201).json({
        message: `Batch created and ${files.length} images queued for AI processing.`,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/image-batches
   * Initiates a batch upload session (1-4 images) and generates presigned R2 upload URLs.
   */
  async createBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const validatedInput = createBatchSchema.parse(req.body);

      const result = await imageService.createBatchSession(userId, validatedInput);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/image-batches/:batchId/complete
   * Verifies that all expected original images exist in Cloudflare R2 and enqueues BullMQ jobs.
   */
  async completeUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;

      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }

      const result = await imageService.completeBatchUpload(batchId, userId);
      res.json({
        message: 'Batch upload verified. Background image processing queued.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/image-batches/:batchId
   * Retrieves batch details, per-image progress, and signed download URLs.
   */
  async getBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;

      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }

      const result = await imageService.getBatchDetails(batchId, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/image-batches/:batchId/cancel
   * Cancels a running or queued batch.
   */
  async cancelBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;

      if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
      }

      const result = await imageService.cancelBatch(batchId, userId);
      res.json({
        message: 'Batch cancelled successfully.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/image-batches/:batchId/images/:imageId/retry
   * Retries an individual failed image from its last completed stage.
   */
  async retryImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
      const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;

      if (!batchId || !imageId) {
        res.status(400).json({ error: 'batchId and imageId are required' });
        return;
      }

      const result = await imageService.retryImage(batchId, imageId, userId);
      res.json({
        message: 'Image processing queued for retry.',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/image-batches/:batchId/images/:imageId
   * Retrieves single image details, analysis, bounding boxes, and version history.
   */
  async getImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
      const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;

      if (!batchId || !imageId) {
        res.status(400).json({ error: 'batchId and imageId are required' });
        return;
      }

      const result = await imageService.getImageDetails(batchId, imageId, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/image-batches/:batchId/images/:imageId/download
   * Generates signed download URLs for final e-commerce formats.
   */
  async downloadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1;
      const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
      const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;

      if (!batchId || !imageId) {
        res.status(400).json({ error: 'batchId and imageId are required' });
        return;
      }

      const urls = await imageService.getImageDownloadUrls(batchId, imageId, userId);
      res.json({
        imageId,
        downloadUrls: urls,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const imageController = new ImageController();
