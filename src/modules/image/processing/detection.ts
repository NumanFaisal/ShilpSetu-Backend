import { aiService } from '../ai/ai.service';
import sharp from 'sharp';
import type { ProductDetectionResult } from '../ai/ai.types';

export interface AbsoluteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  coverage: number;
}

/**
 * Detects the product in the image and converts normalized coordinates to pixel values.
 */
export async function detectProductObject(
  imageBuffer: Buffer,
  options?: { batchId?: string; imageId?: string }
): Promise<AbsoluteBoundingBox> {
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1000;
  const imgHeight = metadata.height || 1000;

  const detection: ProductDetectionResult = await aiService.detectProduct(imageBuffer, options);

  // Normalize scale 0-1000 to image pixel dimensions
  const normX = Math.max(0, Math.min(1000, detection.boundingBox.x));
  const normY = Math.max(0, Math.min(1000, detection.boundingBox.y));
  const normW = Math.max(50, Math.min(1000 - normX, detection.boundingBox.width));
  const normH = Math.max(50, Math.min(1000 - normY, detection.boundingBox.height));

  const pixelX = Math.round((normX / 1000) * imgWidth);
  const pixelY = Math.round((normY / 1000) * imgHeight);
  const pixelWidth = Math.round((normW / 1000) * imgWidth);
  const pixelHeight = Math.round((normH / 1000) * imgHeight);

  const coverage = (pixelWidth * pixelHeight) / (imgWidth * imgHeight);

  return {
    x: pixelX,
    y: pixelY,
    width: pixelWidth,
    height: pixelHeight,
    confidence: detection.confidence,
    coverage: detection.coverage ?? coverage,
  };
}
