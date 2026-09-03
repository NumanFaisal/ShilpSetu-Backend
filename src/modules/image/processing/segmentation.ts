import sharp from 'sharp';
import axios from 'axios';
import FormData from 'form-data';
import { env } from '../../../config/env';
import type { AbsoluteBoundingBox } from './detection';

export interface SegmentationResult {
  cutoutBuffer: Buffer;
  maskBuffer: Buffer;
  method: string;
}

/**
 * Removes the background from the original product photo using Poof.bg AI,
 * producing a clean transparent cutout (PNG with alpha).
 */
export async function removeBackground(
  imageBuffer: Buffer,
  boundingBox?: AbsoluteBoundingBox
): Promise<SegmentationResult> {
  // Method 1: Use Poof.bg AI Background Removal
  if (env.POOF_BG_API_KEY && env.POOF_BG_API_URL) {
    try {
      console.log('[Segmentation] Calling Poof.bg AI background removal API...');
      const formData = new FormData();
      formData.append('image_file', imageBuffer, {
        filename: 'product.jpg',
        contentType: 'image/jpeg',
      });

      const response = await axios.post(env.POOF_BG_API_URL, formData, {
        headers: {
          ...formData.getHeaders(),
          'x-api-key': env.POOF_BG_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 35000,
      });

      if (response.status === 200 && response.data) {
        let cutoutBuffer = Buffer.from(response.data);

        // Trim any extra empty transparent boundary
        try {
          cutoutBuffer = await sharp(cutoutBuffer)
            .trim({
              background: { r: 0, g: 0, b: 0, alpha: 0 },
              threshold: 10,
            })
            .png()
            .toBuffer();
        } catch {
          // Ignore
        }

        const maskBuffer = await extractAlphaMask(cutoutBuffer);
        console.log('[Segmentation] ✅ Poof.bg AI background removal succeeded.');
        return {
          cutoutBuffer,
          maskBuffer,
          method: 'poof_bg_ai',
        };
      }
    } catch (err: any) {
      console.warn(
        '[Segmentation] Poof.bg API error, falling back to bounding-box segmentation:',
        err.response?.status ? `HTTP ${err.response.status}` : err.message
      );
    }
  }

  // Method 2: Smart bounding-box & saliency fallback
  const metadata = await sharp(imageBuffer).metadata();
  const origW = metadata.width || 1000;
  const origH = metadata.height || 1000;

  let workingBuffer = imageBuffer;
  if (boundingBox && boundingBox.width > 20 && boundingBox.height > 20) {
    const padX = Math.round(boundingBox.width * 0.02);
    const padY = Math.round(boundingBox.height * 0.02);

    const cropX = Math.max(0, boundingBox.x - padX);
    const cropY = Math.max(0, boundingBox.y - padY);
    const cropW = Math.min(origW - cropX, boundingBox.width + padX * 2);
    const cropH = Math.min(origH - cropY, boundingBox.height + padY * 2);

    workingBuffer = await sharp(imageBuffer)
      .extract({
        left: cropX,
        top: cropY,
        width: cropW,
        height: cropH,
      })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  return await performSmartForegroundSegmentation(workingBuffer);
}

/**
 * Extracts a black-and-white mask from an image with alpha channel.
 */
export async function extractAlphaMask(pngWithAlpha: Buffer): Promise<Buffer> {
  try {
    return await sharp(pngWithAlpha)
      .extractChannel(3)
      .toColourspace('b-w')
      .png()
      .toBuffer();
  } catch {
    const meta = await sharp(pngWithAlpha).metadata();
    const w = meta.width || 800;
    const h = meta.height || 800;

    const whiteSvg = `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#FFFFFF"/></svg>`;
    return await sharp(Buffer.from(whiteSvg)).png().toBuffer();
  }
}

/**
 * Fallback foreground object isolation.
 */
async function performSmartForegroundSegmentation(
  imageBuffer: Buffer
): Promise<SegmentationResult> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 800;

  const raw = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data } = raw;
  const channels = 4;

  let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;

  for (let x = 0; x < width; x += 4) {
    const topIdx = x * channels;
    bgR += data[topIdx] ?? 255;
    bgG += data[topIdx + 1] ?? 255;
    bgB += data[topIdx + 2] ?? 255;
    sampleCount++;

    const btmIdx = ((height - 1) * width + x) * channels;
    bgR += data[btmIdx] ?? 255;
    bgG += data[btmIdx + 1] ?? 255;
    bgB += data[btmIdx + 2] ?? 255;
    sampleCount++;
  }

  bgR /= Math.max(1, sampleCount);
  bgG /= Math.max(1, sampleCount);
  bgB /= Math.max(1, sampleCount);

  const maskData = Buffer.alloc(width * height);
  const colorTolerance = 35;

  const coreLeft = Math.round(width * 0.15);
  const coreRight = Math.round(width * 0.85);
  const coreTop = Math.round(height * 0.12);
  const coreBottom = Math.round(height * 0.88);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const maskIdx = y * width + x;

      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;

      const dist = Math.sqrt(
        Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
      );

      const inCore = x >= coreLeft && x <= coreRight && y >= coreTop && y <= coreBottom;

      if (inCore) {
        if (dist > colorTolerance * 0.5) {
          data[idx + 3] = 255;
          maskData[maskIdx] = 255;
        } else {
          data[idx + 3] = 220;
          maskData[maskIdx] = 220;
        }
      } else {
        if (dist < colorTolerance) {
          data[idx + 3] = 0;
          maskData[maskIdx] = 0;
        } else {
          data[idx + 3] = 255;
          maskData[maskIdx] = 255;
        }
      }
    }
  }

  let cutoutBuffer = await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  try {
    cutoutBuffer = await sharp(cutoutBuffer)
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 10,
      })
      .png()
      .toBuffer();
  } catch {
    // Ignore
  }

  const maskBuffer = await sharp(maskData, {
    raw: {
      width,
      height,
      channels: 1,
    },
  })
    .png()
    .toBuffer();

  return {
    cutoutBuffer,
    maskBuffer,
    method: 'smart_foreground_segmentation',
  };
}
