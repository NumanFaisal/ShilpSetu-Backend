import multer from 'multer';
import type { Request } from 'express';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 4;

/**
 * Multer memory storage for direct image uploads.
 * Files are kept in memory as buffers for Sharp processing.
 */
const storage = multer.memoryStorage();

/**
 * File filter that only accepts JPEG, PNG, and WebP images.
 */
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type "${file.mimetype}". Allowed: JPEG, PNG, WebP.`));
  }
}

export const uploadImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
}).array('images', MAX_FILES);
