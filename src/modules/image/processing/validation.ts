import sharp from 'sharp';

export interface ImageValidationResult {
  isValid: boolean;
  format?: string;
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
  sizeBytes: number;
  error?: string;
}

/**
 * Validates image integrity, format, and dimensions using Sharp.
 */
export async function validateImageBuffer(
  buffer: Buffer,
  maxSizeBytes: number = 25 * 1024 * 1024
): Promise<ImageValidationResult> {
  if (!buffer || buffer.length === 0) {
    return {
      isValid: false,
      width: 0,
      height: 0,
      channels: 0,
      hasAlpha: false,
      sizeBytes: 0,
      error: 'Empty image buffer provided',
    };
  }

  if (buffer.length > maxSizeBytes) {
    return {
      isValid: false,
      width: 0,
      height: 0,
      channels: 0,
      hasAlpha: false,
      sizeBytes: buffer.length,
      error: `Image exceeds maximum allowed size of ${maxSizeBytes / (1024 * 1024)}MB`,
    };
  }

  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format || !['jpeg', 'png', 'webp', 'tiff', 'heif', 'avif'].includes(metadata.format)) {
      return {
        isValid: false,
        width: metadata.width || 0,
        height: metadata.height || 0,
        channels: metadata.channels || 0,
        hasAlpha: metadata.hasAlpha || false,
        sizeBytes: buffer.length,
        error: `Unsupported image format: ${metadata.format || 'unknown'}`,
      };
    }

    if (!metadata.width || !metadata.height || metadata.width < 100 || metadata.height < 100) {
      return {
        isValid: false,
        width: metadata.width || 0,
        height: metadata.height || 0,
        channels: metadata.channels || 0,
        hasAlpha: metadata.hasAlpha || false,
        sizeBytes: buffer.length,
        error: `Image dimensions too small (${metadata.width}x${metadata.height}). Minimum is 100x100.`,
      };
    }

    return {
      isValid: true,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      channels: metadata.channels || 3,
      hasAlpha: metadata.hasAlpha || false,
      sizeBytes: buffer.length,
    };
  } catch (err: any) {
    return {
      isValid: false,
      width: 0,
      height: 0,
      channels: 0,
      hasAlpha: false,
      sizeBytes: buffer.length,
      error: `Corrupt or unreadable image file: ${err.message}`,
    };
  }
}
