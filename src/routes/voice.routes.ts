import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { voiceService } from '../services/voice.service';

const router = Router();

// Configure multer memory storage for voice recordings (.m4a, .mp3, .wav, .webm, .ogg, etc.)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max voice note
});

/**
 * POST /api/voice/process
 * Accepts multipart/form-data with field "audio" (or "file").
 * Returns original transcription, English translation, detected language, and extracted attributes.
 */
router.post(
  ['/voice/process', '/process'],
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const file = files?.['audio']?.[0] || files?.['file']?.[0] || (req as any).file;

      if (!file) {
        res.status(400).json({ error: 'No audio file uploaded. Please include an audio file in the "audio" form field.' });
        return;
      }

      let ext = 'm4a';
      if (file.mimetype?.includes('webm')) ext = 'webm';
      else if (file.mimetype?.includes('wav')) ext = 'wav';
      else if (file.mimetype?.includes('mp3') || file.mimetype?.includes('mpeg')) ext = 'mp3';
      else if (file.mimetype?.includes('ogg')) ext = 'ogg';
      else if (file.mimetype?.includes('flac')) ext = 'flac';
      else if (file.mimetype?.includes('mp4') || file.mimetype?.includes('m4a')) ext = 'm4a';

      let originalName = file.originalname || `recording.${ext}`;
      if (!originalName.includes('.') || originalName === 'blob') {
        originalName = `recording.${ext}`;
      }

      console.log(`[VoiceRoutes] Processing audio upload: ${originalName} (${file.size} bytes, ${file.mimetype})`);

      const productId = req.body?.productId ? Number(req.body.productId) : undefined;
      const result = await voiceService.processVoiceNote(file.buffer, originalName, productId);

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/voice/:productId
 * Fetch voice input history for a given product.
 */
router.get('/voice/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = Number(req.params.productId);
    const inputs = await voiceService.getVoiceInputsForProduct(productId);
    res.json(inputs);
  } catch (err) {
    next(err);
  }
});

export default router;
