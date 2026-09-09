import { Router } from 'express';
import { imageController } from '../controllers/image.controller';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import { uploadImages } from '../middleware/upload.middleware';

const router = Router();

// Allow authenticated users or guest fallback
router.use(optionalAuthenticate);

// ─── Direct Upload ───────────────────────────────
// POST /api/image-batches/upload — multipart/form-data with "images" field (1–4 files)
router.post(
  '/image-batches/upload',
  (req, res, next) => {
    uploadImages(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  imageController.uploadBatchDirect
);

// ─── Presigned Upload Session ─────────────────────
// POST /api/image-batches — create batch + presigned URLs
router.post('/image-batches', imageController.createBatch);

// POST /api/image-batches/:batchId/complete — finalize upload & enqueue jobs
router.post('/image-batches/:batchId/complete', imageController.completeUpload);

// ─── Batch Queries ────────────────────────────────
// GET /api/image-batches/:batchId — batch details + per-image status
router.get('/image-batches/:batchId', imageController.getBatch);

// POST /api/image-batches/:batchId/cancel — cancel batch
router.post('/image-batches/:batchId/cancel', imageController.cancelBatch);

// ─── Individual Image ─────────────────────────────
// POST /api/image-batches/:batchId/images/:imageId/retry — retry failed image
router.post('/image-batches/:batchId/images/:imageId/retry', imageController.retryImage);

// GET /api/image-batches/:batchId/images/:imageId — image detail + versions
router.get('/image-batches/:batchId/images/:imageId', imageController.getImage);

// GET /api/image-batches/:batchId/images/:imageId/download — signed download URLs
router.get('/image-batches/:batchId/images/:imageId/download', imageController.downloadImage);

export default router;
