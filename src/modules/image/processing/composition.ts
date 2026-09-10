import sharp from 'sharp';

export interface CompositionOptions {
  targetWidth?: number;  // default 2000
  targetHeight?: number; // default 2000
  paddingRatio?: number; // default 0.12 (12% padding)
  verticalAlignment?: 'center' | 'bottom_grounded';
  backgroundBuffer?: Buffer;
}

/**
 * Positions and scales the product with balanced e-commerce studio composition.
 * Uses bottom-grounded alignment (product sits naturally on the surface)
 * with professional padding ratios matching commercial catalog standards.
 */
export async function composeProfessionalStudioShot(
  productBuffer: Buffer,
  options: CompositionOptions = {}
): Promise<Buffer> {
  const targetW = options.targetWidth || 2000;
  const targetH = options.targetHeight || 2000;
  const paddingRatio = options.paddingRatio || 0.12;
  const alignment = options.verticalAlignment || 'bottom_grounded';

  const origMeta = await sharp(productBuffer).metadata();
  // If productBuffer is already an opaque full-bleed studio scene, keep it full-bleed
  if (!origMeta.hasAlpha && origMeta.width && origMeta.height && origMeta.width >= 1500 && !options.backgroundBuffer) {
    return sharp(productBuffer).resize(targetW, targetH, { fit: 'cover' }).toBuffer();
  }

  // Allowed bounding box for the product within the canvas
  const availableW = Math.round(targetW * (1 - paddingRatio * 2));
  const availableH = Math.round(targetH * (1 - paddingRatio * 2));

  // Scale product to fit inside available area without stretching
  const resizedProduct = await sharp(productBuffer)
    .resize(availableW, availableH, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();

  const productMeta = await sharp(resizedProduct).metadata();
  const pW = productMeta.width || availableW;
  const pH = productMeta.height || availableH;

  const left = Math.round((targetW - pW) / 2);
  let top = Math.round((targetH - pH) / 2);

  if (alignment === 'bottom_grounded') {
    // Ground the product slightly above the bottom third — natural placement
    // The shadow (from shadow stage) handles the ground contact visual
    top = Math.round(targetH * (1 - paddingRatio) - pH);
  }

  if (options.backgroundBuffer) {
    return sharp(options.backgroundBuffer)
      .resize(targetW, targetH, { fit: 'cover' })
      .composite([
        {
          input: resizedProduct,
          left: Math.max(0, left),
          top: Math.max(0, top),
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();
  }

  // Create clean white/transparent canvas
  const baseCanvas = await sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return sharp(baseCanvas)
    .composite([
      {
        input: resizedProduct,
        left: Math.max(0, left),
        top: Math.max(0, top),
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();
}
