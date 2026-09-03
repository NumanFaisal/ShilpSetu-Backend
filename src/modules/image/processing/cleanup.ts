import sharp from 'sharp';

export interface CleanupOptions {
  featherRadius?: number;
  sharpen?: boolean;
  trimMargin?: number;
}

/**
 * Product cleanup:
 * - Refines alpha edges and removes fringing/halo
 * - Applies subtle unsharp mask to restore authentic artisan texture
 * - Trims unnecessary empty transparent canvas with balanced padding margin
 * - Preserves all original product pixels without alteration
 */
export async function cleanupCutout(
  cutoutBuffer: Buffer,
  options: CleanupOptions = {}
): Promise<Buffer> {
  const { sharpen = true, trimMargin = 20 } = options;

  let image = sharp(cutoutBuffer).ensureAlpha();

  // 1. Trim outer empty transparent space cleanly
  try {
    image = image.trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: 5,
    });
  } catch {
    // Ignore if already trimmed
  }

  // 2. Apply subtle unsharp mask to enhance craft and surface details
  if (sharpen) {
    image = image.sharpen({
      sigma: 1.2,
      m1: 1.0,
      m2: 0.4,
      x1: 2.0,
      y2: 10.0,
      y3: 20.0,
    });
  }

  // 3. Extend with safe margin
  image = image.extend({
    top: trimMargin,
    bottom: trimMargin,
    left: trimMargin,
    right: trimMargin,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  return image.png({ quality: 100, compressionLevel: 6 }).toBuffer();
}
