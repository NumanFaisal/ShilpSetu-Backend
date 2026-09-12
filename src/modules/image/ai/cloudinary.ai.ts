import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../../config/env';

let isConfigured = false;

function ensureCloudinary(): boolean {
  if (isConfigured) return true;
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    isConfigured = true;
    return true;
  }
  return false;
}

/**
 * Uses Cloudinary Generative AI (`gen_background_replace`) to dynamically generate
 * an AI studio background tailored to the object and composite it with realistic lighting.
 */
export async function generateAIBackgroundFromCutout(
  cutoutBuffer: Buffer,
  prompt: string,
  options?: {
    folder?: string;
    timeoutMs?: number;
  }
): Promise<{ buffer: Buffer; url: string; promptUsed: string } | null> {
  if (!ensureCloudinary()) {
    console.warn('[Cloudinary AI] Missing Cloudinary credentials, skipping GenAI background replace');
    return null;
  }

  // Sanitize prompt: Cloudinary URL parameters cannot contain commas
  const sanitizedPrompt = prompt
    .replace(/,/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const folder = options?.folder || 'shilpsetu_ai_studio';
  const timeoutMs = options?.timeoutMs || 25000;

  try {
    console.log(`[Cloudinary AI] Uploading cutout to generate AI background with prompt: "${sanitizedPrompt}"`);

    // 1. Upload transparent cutout
    const uploadResult: any = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          format: 'png',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(cutoutBuffer);
    });

    if (!uploadResult?.public_id) {
      console.warn('[Cloudinary AI] Upload failed without public_id');
      return null;
    }

    // 2. Generate transformation URL with gen_background_replace
    const genAiUrl = cloudinary.url(uploadResult.public_id, {
      transformation: [
        { effect: `gen_background_replace:prompt_${sanitizedPrompt}` },
        { fetch_format: 'png' },
        { quality: 'auto:best' },
      ],
    });

    console.log(`[Cloudinary AI] Fetching generated AI background from: ${genAiUrl}`);

    // 3. Fetch the AI generated image
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(genAiUrl, { signal: controller.signal });
    clearTimeout(timeoutTimer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `[Cloudinary AI] GenAI background request failed (${response.status}): ${errorText.slice(0, 200)}`
      );
      return null;
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    console.log(`[Cloudinary AI] ✅ Successfully generated AI background (${buffer.length} bytes)`);

    return {
      buffer,
      url: genAiUrl,
      promptUsed: sanitizedPrompt,
    };
  } catch (err: any) {
    console.warn('[Cloudinary AI] Generative background replace failed:', err.message);
    return null;
  }
}
