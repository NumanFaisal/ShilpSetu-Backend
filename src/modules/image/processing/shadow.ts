import sharp from 'sharp';

export interface ShadowOptions {
  opacity?: number;      // 0.0 - 1.0 (default 0.35)
  blurSigma?: number;    // blur softness (default 18)
  offsetY?: number;      // vertical position offset below base
  scaleX?: number;       // horizontal shadow span (default 0.90)
  scaleY?: number;       // vertical shadow thickness (default 0.16)
}

/**
 * Creates and composites a realistic soft contact & ground drop shadow under the product base,
 * matching commercial studio product photography.
 */
export async function applyRealisticContactShadow(
  productWithAlphaBuffer: Buffer,
  backgroundBuffer?: Buffer,
  options: ShadowOptions = {}
): Promise<Buffer> {
  let canvasWidth = 2000;
  let canvasHeight = 2000;

  if (backgroundBuffer) {
    const bgMeta = await sharp(backgroundBuffer).metadata();
    canvasWidth = bgMeta.width || 2000;
    canvasHeight = bgMeta.height || 2000;
  } else {
    const pMeta = await sharp(productWithAlphaBuffer).metadata();
    canvasWidth = pMeta.width || 2000;
    canvasHeight = pMeta.height || 2000;
  }

  const opacity = options.opacity ?? 0.32;
  const scaleX = options.scaleX ?? 0.92;
  const scaleY = options.scaleY ?? 0.16;

  const maxW = Math.round(canvasWidth * 0.70);
  const maxH = Math.round(canvasHeight * 0.70);

  const resizedProduct = await sharp(productWithAlphaBuffer)
    .resize(maxW, maxH, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();

  const productMeta = await sharp(resizedProduct).metadata();
  const pWidth = productMeta.width || maxW;
  const pHeight = productMeta.height || maxH;

  const productLeft = Math.round((canvasWidth - pWidth) / 2);
  const productTop = Math.round((canvasHeight - pHeight) * 0.45);

  // Shadow dimensions proportional to product width
  const shadowW = Math.round(pWidth * scaleX);
  const shadowH = Math.round(pHeight * scaleY);
  const cx = Math.round(shadowW / 2);
  const cy = Math.round(shadowH / 2);

  // Dual-layer realistic shadow: dark contact occlusion + diffused ground pool
  const shadowSvg = `
    <svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Soft Ground Pool Shadow -->
        <radialGradient id="groundPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#000000" stop-opacity="${opacity * 0.7}"/>
          <stop offset="45%" stop-color="#000000" stop-opacity="${opacity * 0.35}"/>
          <stop offset="80%" stop-color="#000000" stop-opacity="${opacity * 0.08}"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <!-- Tight Contact Occlusion Shadow directly under base -->
        <radialGradient id="contactOcclusion" cx="50%" cy="50%" r="45%">
          <stop offset="0%" stop-color="#000000" stop-opacity="${opacity * 0.95}"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="${opacity * 0.5}"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${cx}" cy="${cy}" rx="${shadowW * 0.46}" ry="${shadowH * 0.44}" fill="url(#groundPool)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${shadowW * 0.38}" ry="${shadowH * 0.22}" fill="url(#contactOcclusion)"/>
    </svg>
  `;

  const shadowBuffer = await sharp(Buffer.from(shadowSvg))
    .blur(16)
    .png()
    .toBuffer();

  const shadowLeft = Math.round(productLeft + (pWidth - shadowW) / 2);
  const shadowTop = Math.round(productTop + pHeight - shadowH * 0.52) + (options.offsetY || 0);

  if (backgroundBuffer) {
    return sharp(backgroundBuffer)
      .resize(canvasWidth, canvasHeight, { fit: 'cover' })
      .composite([
        {
          input: shadowBuffer,
          left: Math.max(0, shadowLeft),
          top: Math.max(0, shadowTop),
          blend: 'multiply',
        },
        {
          input: resizedProduct,
          left: Math.max(0, productLeft),
          top: Math.max(0, productTop),
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();
  }

  const canvas = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

  return sharp(canvas)
    .composite([
      {
        input: shadowBuffer,
        left: Math.max(0, shadowLeft),
        top: Math.max(0, shadowTop),
        blend: 'over',
      },
      {
        input: resizedProduct,
        left: Math.max(0, productLeft),
        top: Math.max(0, productTop),
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();
}
