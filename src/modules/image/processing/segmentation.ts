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
 * Removes the background from the product photo using ONLY Poof.bg AI background removal.
 * Dedicated background removal engine per specification.
 */
export async function removeBackground(
  imageBuffer: Buffer,
  boundingBox?: AbsoluteBoundingBox
): Promise<SegmentationResult> {
  const apiUrl = env.POOF_BG_API_URL || 'https://api.poof.bg/v1/remove';
  const apiKey = env.POOF_BG_API_KEY;

  if (!apiKey) {
    throw new Error('POOF_BG_API_KEY is not configured. Poof.bg is required for background removal.');
  }

  try {
    console.log('[Segmentation] Calling Poof.bg AI for product background removal...');

    // Resize to max 1024px preserving craft detail while achieving instant network upload (<150KB)
    const uploadBuffer = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const formData = new FormData();
    formData.append('image_file', uploadBuffer, {
      filename: 'product.jpg',
      contentType: 'image/jpeg',
    });
    formData.append('size', 'auto');
    formData.append('type', 'product');

    const response = await axios.post(apiUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'x-api-key': apiKey,
      },
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    if (response.status === 200 && response.data && response.data.length > 1000) {
      let cutoutBuffer = Buffer.from(response.data);

      // Verify returned buffer is a PNG (magic bytes: 0x89 0x50 0x4E 0x47)
      if (
        cutoutBuffer[0] === 0x89 &&
        cutoutBuffer[1] === 0x50 &&
        cutoutBuffer[2] === 0x4e &&
        cutoutBuffer[3] === 0x47
      ) {
        try {
          cutoutBuffer = await sharp(cutoutBuffer)
            .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
            .png()
            .toBuffer();
        } catch {}

        const maskBuffer = await extractAlphaMask(cutoutBuffer);
        console.log('[Segmentation] ✅ Poof.bg background removal succeeded.');
        return { cutoutBuffer, maskBuffer, method: 'poof_bg_ai' };
      }
    }
    throw new Error(`Poof.bg returned invalid image format or empty response.`);
  } catch (err: any) {
    console.error('[Segmentation] Poof.bg background removal failed:', err.message);
    throw new Error(`Background removal failed via Poof.bg: ${err.message}`);
  }
}

/**
 * Extracts a black-and-white mask from an image with alpha channel.
 */
export async function extractAlphaMask(pngWithAlpha: Buffer): Promise<Buffer> {
  try {
    const raw = await sharp(pngWithAlpha)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = raw;
    const pixelCount = info.width * info.height;
    const maskData = Buffer.alloc(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      const alpha = data[i * 4 + 3] ?? 0;
      maskData[i] = alpha > 20 ? 255 : 0;
    }

    return await sharp(maskData, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 1,
      },
    })
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
