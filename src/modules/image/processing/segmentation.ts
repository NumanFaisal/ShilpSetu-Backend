import sharp from 'sharp';
import axios from 'axios';
import FormData from 'form-data';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { env } from '../../../config/env';
import type { AbsoluteBoundingBox } from './detection';

export interface SegmentationResult {
  cutoutBuffer: Buffer;
  maskBuffer: Buffer;
  method: string;
}

let poofBgCircuitOpenUntil = 0;
let openAiSegmentationClient: OpenAI | null = null;
let geminiSegmentationClient: GoogleGenAI | null = null;

function getGeminiSegmentationClient(): GoogleGenAI | null {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!geminiSegmentationClient) {
    geminiSegmentationClient = new GoogleGenAI({ apiKey });
  }
  return geminiSegmentationClient;
}

function getOpenAISegmentationClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!openAiSegmentationClient) {
    openAiSegmentationClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openAiSegmentationClient;
}

/**
 * Removes the background from the original product photo,
 * producing a clean transparent cutout (PNG with alpha).
 *
 * Tier 1: Poof.bg AI Background Removal (~100ms, dedicated product-removal API)
 * Tier 2: Gemini Vision AI Precision Polygon Segmentation (fallback if no poof.bg key)
 * Tier 3: OpenAI Vision AI Precision Polygon Segmentation (instant fallback if Poof / Gemini fail)
 * Tier 4: Adaptive Perimeter Edge & Color Segmentation (offline/last-resort)
 */
export async function removeBackground(
  imageBuffer: Buffer,
  boundingBox?: AbsoluteBoundingBox
): Promise<SegmentationResult> {
  // Method 1: Poof.bg AI Background Removal — fastest (~100ms) and most accurate
  // for product photos. Runs first to keep total pipeline time under 5 seconds.
  const isCircuitOpen = Date.now() < poofBgCircuitOpenUntil;
  if (!isCircuitOpen && env.POOF_BG_API_KEY) {
    const apiUrl = env.POOF_BG_API_URL || 'https://api.poof.bg/v1/remove';
    try {
      console.log('[Segmentation] Calling Poof.bg AI for product background removal...');

      // Downscale to max 800px: still sharp for e-commerce but uploads ~2x faster
      const uploadBuffer = await sharp(imageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      const formData = new FormData();
      formData.append('image_file', uploadBuffer, {
        filename: 'product.jpg',
        contentType: 'image/jpeg',
      });
      formData.append('size', 'auto');
      // 'product' hint tells poof.bg to treat the subject as an object (not a person),
      // which improves edge quality for artisan crafts significantly.
      formData.append('type', 'product');

      const response = await axios.post(apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'x-api-key': env.POOF_BG_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 8000, // generous ceiling; typical response is <1s
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
    } catch (err: any) {
      console.warn(
        '[Segmentation] Poof.bg API error/timeout, opening circuit breaker for 60s:',
        err.message
      );
      poofBgCircuitOpenUntil = Date.now() + 60_000;
    }
  }

  // Method 2: Gemini Vision AI Precision Contour Segmentation (fallback)
  if (env.GEMINI_API_KEY) {
    try {
      console.log('[Segmentation] Falling back to Gemini Vision AI contour segmentation...');
      const geminiResult = await segmentWithGeminiVision(imageBuffer);
      if (geminiResult) {
        console.log('[Segmentation] ✅ Gemini Vision AI segmentation succeeded!');
        return geminiResult;
      }
    } catch (err: any) {
      console.warn('[Segmentation] Gemini Vision AI segmentation failed:', err.message);
    }
  }

  // Method 3: OpenAI Vision AI Precision Contour Segmentation (instant fallback if Poof / Gemini fail)
  if (env.OPENAI_API_KEY) {
    try {
      console.log('[Segmentation] Falling back instantly to OpenAI Vision AI contour segmentation...');
      const openAiResult = await segmentWithOpenAIVision(imageBuffer);
      if (openAiResult) {
        console.log('[Segmentation] ✅ OpenAI Vision AI segmentation succeeded!');
        return openAiResult;
      }
    } catch (err: any) {
      console.warn('[Segmentation] OpenAI Vision AI segmentation failed:', err.message);
    }
  }

  // Method 4: Adaptive perimeter flood-fill segmentation (offline last resort)
  console.log('[Segmentation] Running adaptive perimeter flood-fill segmentation...');
  return await performSmartForegroundSegmentation(imageBuffer, boundingBox);
}

/**
 * Uses Gemini Vision to trace a high-precision polygon boundary around the product,
 * producing an exact cutout mask with smooth antialiased edges.
 */
async function segmentWithGeminiVision(
  imageBuffer: Buffer
): Promise<SegmentationResult | null> {
  const ai = getGeminiSegmentationClient();
  if (!ai) return null;

  const meta = await sharp(imageBuffer).metadata();
  const origWidth = meta.width || 1200;
  const origHeight = meta.height || 1200;

  // Downscale to max 1024px for lightning-fast network transfer (< 120KB)
  const uploadBuffer = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = `You are a precision computer vision system for e-commerce artisan catalog photography.
Detect the EXACT visual outer boundary of the SINGLE MAIN PRODUCT/CRAFT item in the foreground.
CRITICAL RULES:
1. Identify ONLY the craft/product itself.
2. Completely EXCLUDE and REMOVE the background: tables, wooden desks, mats, bedsheets, blankets, floors, tiles, walls, room backgrounds, hands holding the item, loose objects, and cast shadows.
3. Trace the outer boundary of the product tightly with a single closed polygon.
4. Coordinates are normalized from 0 to 1000 where [0,0] is top-left and [1000, 1000] is bottom-right.
5. Return 30 to 80 points to accurately hug curves, handles, and corners.

Respond ONLY with one valid JSON object:
{
  "polygon": [
    [x, y], ...
  ]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: uploadBuffer.toString('base64'),
              mimeType: 'image/jpeg',
            },
          },
        ],
      },
    ],
  });

  const text = response.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  const data = JSON.parse(match[0]);
  const points: [number, number][] = data.polygon;

  if (!Array.isArray(points) || points.length < 8) {
    return null;
  }

  // Convert normalized [0..1000] points to original image pixel coordinates
  const svgPoints = points
    .map(([nx, ny]) => `${Math.round((nx / 1000) * origWidth)},${Math.round((ny / 1000) * origHeight)}`)
    .join(' ');

  const maskSvg = `<svg width="${origWidth}" height="${origHeight}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${svgPoints}" fill="#FFFFFF"/>
  </svg>`;

  // Rasterize smooth feathered mask
  const smoothMask = await sharp(Buffer.from(maskSvg))
    .resize(origWidth, origHeight)
    .blur(1.5)
    .toBuffer();

  // Composite onto original image using dest-in to produce transparent cutout
  let cutoutBuffer = await sharp(imageBuffer)
    .ensureAlpha()
    .composite([
      {
        input: smoothMask,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // Trim transparent margins
  try {
    cutoutBuffer = await sharp(cutoutBuffer)
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 10,
      })
      .png()
      .toBuffer();
  } catch {}

  const maskBuffer = await extractAlphaMask(cutoutBuffer);

  return {
    cutoutBuffer,
    maskBuffer,
    method: 'gemini_vision_contour',
  };
}

/**
 * Uses OpenAI Vision (gpt-4o / gpt-4o-mini) to trace a high-precision polygon boundary around the product,
 * producing an exact cutout mask with smooth antialiased edges.
 */
async function segmentWithOpenAIVision(
  imageBuffer: Buffer
): Promise<SegmentationResult | null> {
  const client = getOpenAISegmentationClient();
  if (!client) return null;

  const meta = await sharp(imageBuffer).metadata();
  const origWidth = meta.width || 1200;
  const origHeight = meta.height || 1200;

  // Downscale to max 1024px for lightning-fast network transfer
  const uploadBuffer = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = `You are a precision computer vision system for e-commerce artisan catalog photography.
Detect the EXACT visual outer boundary of the SINGLE MAIN PRODUCT/CRAFT item in the foreground.
CRITICAL RULES:
1. Identify ONLY the craft/product itself.
2. Completely EXCLUDE and REMOVE the background: tables, wooden desks, mats, bedsheets, blankets, floors, tiles, walls, room backgrounds, hands holding the item, loose objects, and cast shadows.
3. Trace the outer boundary of the product tightly with a single closed polygon.
4. Coordinates are normalized from 0 to 1000 where [0,0] is top-left and [1000, 1000] is bottom-right.
5. Return 30 to 80 points to accurately hug curves, handles, and corners.

Respond ONLY with one valid JSON object:
{
  "polygon": [
    [x, y], ...
  ]
}`;

  const models = ['gpt-4o', 'gpt-4o-mini'];
  for (const model of models) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${uploadBuffer.toString('base64')}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
      });

      const text = response.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const data = JSON.parse(match[0]);
      const points: [number, number][] = data.polygon;

      if (!Array.isArray(points) || points.length < 8) {
        continue;
      }

      // Convert normalized [0..1000] points to original image pixel coordinates
      const svgPoints = points
        .map(([nx, ny]) => `${Math.round((nx / 1000) * origWidth)},${Math.round((ny / 1000) * origHeight)}`)
        .join(' ');

      const maskSvg = `<svg width="${origWidth}" height="${origHeight}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${svgPoints}" fill="#FFFFFF"/>
      </svg>`;

      // Rasterize smooth feathered mask
      const smoothMask = await sharp(Buffer.from(maskSvg))
        .resize(origWidth, origHeight)
        .blur(1.5)
        .toBuffer();

      // Composite onto original image using dest-in to produce transparent cutout
      let cutoutBuffer = await sharp(imageBuffer)
        .ensureAlpha()
        .composite([
          {
            input: smoothMask,
            blend: 'dest-in',
          },
        ])
        .png()
        .toBuffer();

      // Trim transparent margins
      try {
        cutoutBuffer = await sharp(cutoutBuffer)
          .trim({
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            threshold: 10,
          })
          .png()
          .toBuffer();
      } catch {}

      const maskBuffer = await extractAlphaMask(cutoutBuffer);

      return {
        cutoutBuffer,
        maskBuffer,
        method: `openai_vision_${model}_contour`,
      };
    } catch (mErr: any) {
      console.warn(`[Segmentation] OpenAI model ${model} failed: ${mErr.message}`);
    }
  }

  return null;
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
      const alpha = data[i * 4 + 3];
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

/**
 * High-accuracy edge-connected flood-fill segmentation (local fallback).
 * Samples perimeter colors and floods inward to carve out background while preserving craft.
 */
async function performSmartForegroundSegmentation(
  imageBuffer: Buffer,
  boundingBox?: AbsoluteBoundingBox
): Promise<SegmentationResult> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 800;

  // Work on a normalized dimension for high speed & consistency
  const workW = Math.min(800, width);
  const workH = Math.round((height / width) * workW);

  const raw = await sharp(imageBuffer)
    .resize(workW, workH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data } = raw;
  const totalPixels = workW * workH;
  const channels = 4;

  // Step 1: Collect border sample pixels from all 4 perimeter edges (10px deep)
  const borderDepth = Math.max(3, Math.round(Math.min(workW, workH) * 0.04));
  const borderPalette: [number, number, number][] = [];

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      if (
        y < borderDepth ||
        y >= workH - borderDepth ||
        x < borderDepth ||
        x >= workW - borderDepth
      ) {
        if ((x + y) % 3 === 0) {
          const idx = (y * workW + x) * channels;
          borderPalette.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
      }
    }
  }

  // Step 2: BFS Flood Fill starting from all perimeter borders
  const isBg = new Uint8Array(totalPixels);
  const queue: number[] = [];

  // Seed all outer border pixels
  for (let x = 0; x < workW; x++) {
    const topIdx = x;
    const btmIdx = (workH - 1) * workW + x;
    isBg[topIdx] = 1;
    isBg[btmIdx] = 1;
    queue.push(topIdx, btmIdx);
  }
  for (let y = 1; y < workH - 1; y++) {
    const leftIdx = y * workW;
    const rightIdx = y * workW + (workW - 1);
    isBg[leftIdx] = 1;
    isBg[rightIdx] = 1;
    queue.push(leftIdx, rightIdx);
  }

  // If bounding box was provided, any pixel outside the bounding box is guaranteed background
  if (boundingBox) {
    const bx1 = Math.max(0, Math.floor((boundingBox.x / width) * workW));
    const by1 = Math.max(0, Math.floor((boundingBox.y / height) * workH));
    const bx2 = Math.min(workW - 1, Math.ceil(((boundingBox.x + boundingBox.width) / width) * workW));
    const by2 = Math.min(workH - 1, Math.ceil(((boundingBox.y + boundingBox.height) / height) * workH));

    for (let y = 0; y < workH; y++) {
      for (let x = 0; x < workW; x++) {
        if (x < bx1 || x > bx2 || y < by1 || y > by2) {
          const idx = y * workW + x;
          if (isBg[idx] === 0) {
            isBg[idx] = 1;
            queue.push(idx);
          }
        }
      }
    }
  }

  // Helper: test minimum color distance to border palette
  const getMinPaletteDist = (r: number, g: number, b: number): number => {
    let minDist = 9999;
    const step = Math.max(1, Math.floor(borderPalette.length / 35));
    for (let i = 0; i < borderPalette.length; i += step) {
      const [pr, pg, pb] = borderPalette[i];
      const d = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
      if (d < minDist) {
        minDist = d;
        if (d < 15) break;
      }
    }
    return minDist;
  };

  let head = 0;
  while (head < queue.length) {
    const curIdx = queue[head++];
    const cx = curIdx % workW;
    const cy = Math.floor(curIdx / workW);

    const cPix = curIdx * channels;
    const cr = data[cPix];
    const cg = data[cPix + 1];
    const cb = data[cPix + 2];

    const neighbors = [
      cy > 0 ? (cy - 1) * workW + cx : -1,
      cy < workH - 1 ? (cy + 1) * workW + cx : -1,
      cx > 0 ? cy * workW + (cx - 1) : -1,
      cx < workW - 1 ? cy * workW + (cx + 1) : -1,
    ];

    for (const nIdx of neighbors) {
      if (nIdx === -1 || isBg[nIdx] === 1) continue;

      const nPix = nIdx * channels;
      const nr = data[nPix];
      const ng = data[nPix + 1];
      const nb = data[nPix + 2];

      const neighborDist = Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb);
      const paletteDist = getMinPaletteDist(nr, ng, nb);

      // Flood fills across smooth background surfaces (table, wall, sheet)
      // Stops when encountering strong color difference (the artisan product edge)
      if (neighborDist < 30 || paletteDist < 55) {
        isBg[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  // Step 3: Build high-contrast 1-channel alpha mask buffer
  const maskData = Buffer.alloc(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    maskData[i] = isBg[i] === 1 ? 0 : 255;
  }

  // Smooth mask to remove staircase artifacts
  const smoothMask = await sharp(maskData, {
    raw: { width: workW, height: workH, channels: 1 },
  })
    .blur(1.5)
    .resize(width, height)
    .toBuffer();

  // Composite onto original image using dest-in
  let cutoutBuffer = await sharp(imageBuffer)
    .ensureAlpha()
    .composite([
      {
        input: smoothMask,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // Trim empty margins
  try {
    cutoutBuffer = await sharp(cutoutBuffer)
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 15,
      })
      .png()
      .toBuffer();
  } catch {}

  const maskBuffer = await extractAlphaMask(cutoutBuffer);

  return {
    cutoutBuffer,
    maskBuffer,
    method: 'adaptive_palette_perimeter_segmentation',
  };
}
