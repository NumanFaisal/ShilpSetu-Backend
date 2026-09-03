import sharp from 'sharp';
import { aiService } from '../ai/ai.service';
import type { ProductSpecification, StudioStyle } from '../ai/ai.types';

export interface StudioReconstructionResult {
  studioBuffer: Buffer;
  style: string;
  method: string;
  promptUsed: string;
}

/**
 * Reconstructs a seamless, commercial e-commerce studio environment matching professional catalog photography.
 */
export async function reconstructStudioEnvironment(
  cleanedProductBuffer: Buffer,
  productSpec: ProductSpecification,
  style: StudioStyle | string = 'white_studio',
  options?: { batchId?: string | undefined; imageId?: string | undefined; targetWidth?: number | undefined; targetHeight?: number | undefined }
): Promise<StudioReconstructionResult> {
  const targetW = options?.targetWidth ?? 2000;
  const targetH = options?.targetHeight ?? 2000;

  // Generate seamless studio cyclorama backdrop with real textures
  const backdrop = await createSeamlessStudioBackdrop(style, targetW, targetH);
  const compositeBuffer = await compositeProductSeamlessly(
    cleanedProductBuffer,
    backdrop,
    targetW,
    targetH
  );

  return {
    studioBuffer: compositeBuffer,
    style,
    method: 'seamless_studio_composite',
    promptUsed: `Seamless Commercial Studio: ${style}`,
  };
}

// ─── Realistic Studio Backdrops ──────────────────────

/**
 * Generates a realistic, textured studio backdrop matching commercial product photography.
 * Each style uses layered SVG gradients + noise turbulence + surface-specific details.
 */
export async function createSeamlessStudioBackdrop(
  style: StudioStyle | string,
  width: number,
  height: number
): Promise<Buffer> {
  let svgBg = '';

  switch (style) {
    case 'wooden_surface':
      svgBg = createWoodSurfaceSVG(width, height);
      break;

    case 'marble_surface':
      svgBg = createMarbleSurfaceSVG(width, height);
      break;

    case 'luxury':
      svgBg = createLuxuryStudioSVG(width, height);
      break;

    case 'white_studio':
    default:
      svgBg = createWhiteStudioSVG(width, height);
      break;
  }

  // Render SVG to buffer
  let baseBuffer = await sharp(Buffer.from(svgBg))
    .resize(width, height)
    .jpeg({ quality: 98 })
    .toBuffer();

  // Add subtle photographic noise grain for realism
  baseBuffer = await addPhotographicGrain(baseBuffer, width, height);

  return baseBuffer;
}

// ─── White Studio — Clean cyclorama with soft lighting ─

function createWhiteStudioSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Main cyclorama gradient — warm center fading to cool edges -->
        <radialGradient id="cycMain" cx="48%" cy="38%" r="72%" fx="45%" fy="35%">
          <stop offset="0%" stop-color="#FEFEFE"/>
          <stop offset="15%" stop-color="#FBFBFC"/>
          <stop offset="35%" stop-color="#F5F6F8"/>
          <stop offset="55%" stop-color="#ECEEF1"/>
          <stop offset="75%" stop-color="#DFE2E7"/>
          <stop offset="90%" stop-color="#D0D4DA"/>
          <stop offset="100%" stop-color="#C2C7CF"/>
        </radialGradient>

        <!-- Soft key light from upper-left -->
        <radialGradient id="keyLight" cx="32%" cy="22%" r="55%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
          <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>

        <!-- Subtle fill light from right -->
        <radialGradient id="fillLight" cx="75%" cy="45%" r="40%">
          <stop offset="0%" stop-color="#F8F9FA" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#F8F9FA" stop-opacity="0"/>
        </radialGradient>

        <!-- Floor shadow / depth at bottom -->
        <linearGradient id="floorDepth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="85%" stop-color="#000000" stop-opacity="0.025"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.06"/>
        </linearGradient>

        <!-- Vignette -->
        <radialGradient id="vignette" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="70%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.08"/>
        </radialGradient>

        <!-- Subtle texture noise -->
        <filter id="grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
          <feBlend in="SourceGraphic" in2="grayNoise" mode="soft-light" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>

      <!-- Base cyclorama -->
      <rect width="100%" height="100%" fill="url(#cycMain)"/>
      <!-- Key light -->
      <rect width="100%" height="100%" fill="url(#keyLight)"/>
      <!-- Fill light -->
      <rect width="100%" height="100%" fill="url(#fillLight)"/>
      <!-- Floor depth -->
      <rect width="100%" height="100%" fill="url(#floorDepth)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#vignette)"/>
      <!-- Grain texture -->
      <rect width="100%" height="100%" filter="url(#grain)" opacity="0.04"/>
    </svg>
  `;
}

// ─── Wood Surface — Realistic wood grain texture ─────

function createWoodSurfaceSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Base warm wood tone -->
        <linearGradient id="woodBase" x1="0%" y1="0%" x2="100%" y2="85%">
          <stop offset="0%" stop-color="#C49A6C"/>
          <stop offset="20%" stop-color="#B8895A"/>
          <stop offset="45%" stop-color="#A67B4B"/>
          <stop offset="70%" stop-color="#9A7042"/>
          <stop offset="100%" stop-color="#8B6238"/>
        </linearGradient>

        <!-- Wood grain pattern — horizontal bands -->
        <filter id="woodGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.25" numOctaves="6" seed="42" stitchTiles="stitch" result="grain"/>
          <feColorMatrix type="saturate" values="0" in="grain" result="grayGrain"/>
          <feComponentTransfer in="grayGrain" result="shaped">
            <feFuncR type="linear" slope="0.3" intercept="0.35"/>
            <feFuncG type="linear" slope="0.3" intercept="0.35"/>
            <feFuncB type="linear" slope="0.3" intercept="0.35"/>
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="shaped" mode="multiply"/>
        </filter>

        <!-- Fine grain detail -->
        <filter id="fineGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.5" numOctaves="3" seed="17" stitchTiles="stitch" result="fine"/>
          <feColorMatrix type="saturate" values="0" in="fine" result="grayFine"/>
          <feBlend in="SourceGraphic" in2="grayFine" mode="soft-light"/>
        </filter>

        <!-- Directional light from upper-left (window light) -->
        <linearGradient id="windowLight" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>
          <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.05"/>
        </linearGradient>

        <!-- Subtle vignette -->
        <radialGradient id="woodVignette" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>
        </radialGradient>

        <!-- Warm color cast -->
        <radialGradient id="warmCast" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stop-color="#FFD4A0" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>

        <!-- Photographic noise -->
        <filter id="photoNoise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
          <feBlend in="SourceGraphic" in2="grayNoise" mode="soft-light" result="blended"/>
          <feComposite in="blended" in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>

      <!-- Base wood tone -->
      <rect width="100%" height="100%" fill="url(#woodBase)"/>
      <!-- Wood grain bands -->
      <rect width="100%" height="100%" filter="url(#woodGrain)"/>
      <!-- Fine grain detail -->
      <rect width="100%" height="100%" filter="url(#fineGrain)" opacity="0.6"/>
      <!-- Window light -->
      <rect width="100%" height="100%" fill="url(#windowLight)"/>
      <!-- Warm color cast -->
      <rect width="100%" height="100%" fill="url(#warmCast)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#woodVignette)"/>
      <!-- Photo noise -->
      <rect width="100%" height="100%" filter="url(#photoNoise)" opacity="0.03"/>
    </svg>
  `;
}

// ─── Marble Surface — Carrara with veining ──────────

function createMarbleSurfaceSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Base marble white -->
        <radialGradient id="marbleBase" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stop-color="#F2F0ED"/>
          <stop offset="25%" stop-color="#ECEAE6"/>
          <stop offset="50%" stop-color="#E5E3DF"/>
          <stop offset="75%" stop-color="#DDDBD7"/>
          <stop offset="100%" stop-color="#D5D2CD"/>
        </radialGradient>

        <!-- Marble veining — diagonal flowing pattern -->
        <filter id="marbleVeins" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.008 0.012" numOctaves="5" seed="7" stitchTiles="stitch" result="veinNoise"/>
          <feColorMatrix type="saturate" values="0" in="veinNoise" result="grayVeins"/>
          <feComponentTransfer in="grayVeins" result="sharpVeins">
            <feFuncR type="discrete" tableValues="0.82 0.82 0.82 0.78 0.74 0.78 0.82"/>
            <feFuncG type="discrete" tableValues="0.81 0.81 0.81 0.77 0.73 0.77 0.81"/>
            <feFuncB type="discrete" tableValues="0.80 0.80 0.80 0.77 0.74 0.77 0.80"/>
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="sharpVeins" mode="multiply"/>
        </filter>

        <!-- Fine secondary veins -->
        <filter id="fineVeins" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.02 0.03" numOctaves="4" seed="23" stitchTiles="stitch" result="fine"/>
          <feColorMatrix type="saturate" values="0" in="fine" result="grayFine"/>
          <feComponentTransfer in="grayFine" result="subtle">
            <feFuncR type="linear" slope="0.15" intercept="0.42"/>
            <feFuncG type="linear" slope="0.15" intercept="0.42"/>
            <feFuncB type="linear" slope="0.15" intercept="0.43"/>
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="subtle" mode="multiply"/>
        </filter>

        <!-- Polished surface reflection -->
        <linearGradient id="polishSheen" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.04"/>
          <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.03"/>
        </linearGradient>

        <!-- Soft studio light -->
        <radialGradient id="marbleLight" cx="42%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>

        <!-- Vignette -->
        <radialGradient id="marbleVignette" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.1"/>
        </radialGradient>

        <!-- Cool blue-gray tint for marble -->
        <radialGradient id="coolTint" cx="60%" cy="55%" r="50%">
          <stop offset="0%" stop-color="#C8D4E0" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Base marble -->
      <rect width="100%" height="100%" fill="url(#marbleBase)"/>
      <!-- Primary veining -->
      <rect width="100%" height="100%" filter="url(#marbleVeins)"/>
      <!-- Fine veining -->
      <rect width="100%" height="100%" filter="url(#fineVeins)" opacity="0.5"/>
      <!-- Polished sheen -->
      <rect width="100%" height="100%" fill="url(#polishSheen)"/>
      <!-- Studio light -->
      <rect width="100%" height="100%" fill="url(#marbleLight)"/>
      <!-- Cool tint -->
      <rect width="100%" height="100%" fill="url(#coolTint)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#marbleVignette)"/>
    </svg>
  `;
}

// ─── Luxury — Dark editorial studio ──────────────────

function createLuxuryStudioSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Deep dark base -->
        <radialGradient id="luxBase" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="#1E222A"/>
          <stop offset="25%" stop-color="#181B22"/>
          <stop offset="50%" stop-color="#12141A"/>
          <stop offset="75%" stop-color="#0C0D12"/>
          <stop offset="100%" stop-color="#060709"/>
        </radialGradient>

        <!-- Warm spotlight from above -->
        <radialGradient id="spotLight" cx="50%" cy="28%" r="35%">
          <stop offset="0%" stop-color="#FFD4A8" stop-opacity="0.14"/>
          <stop offset="30%" stop-color="#FFD4A8" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#FFD4A8" stop-opacity="0"/>
        </radialGradient>

        <!-- Subtle fabric/velvet texture -->
        <filter id="velvetTexture" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.4 0.5" numOctaves="5" seed="31" stitchTiles="stitch" result="velvet"/>
          <feColorMatrix type="saturate" values="0" in="velvet" result="grayVelvet"/>
          <feComponentTransfer in="grayVelvet" result="subtleVelvet">
            <feFuncR type="linear" slope="0.08" intercept="0.46"/>
            <feFuncG type="linear" slope="0.08" intercept="0.46"/>
            <feFuncB type="linear" slope="0.08" intercept="0.47"/>
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="subtleVelvet" mode="soft-light"/>
        </filter>

        <!-- Golden rim light from behind -->
        <radialGradient id="rimLight" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="85%" stop-color="#C4985A" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#C4985A" stop-opacity="0.08"/>
        </radialGradient>

        <!-- Deep vignette for drama -->
        <radialGradient id="luxVignette" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
        </radialGradient>

        <!-- Subtle warm pool at center -->
        <radialGradient id="warmPool" cx="50%" cy="50%" r="30%">
          <stop offset="0%" stop-color="#2A2530" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Dark base -->
      <rect width="100%" height="100%" fill="url(#luxBase)"/>
      <!-- Velvet texture -->
      <rect width="100%" height="100%" filter="url(#velvetTexture)"/>
      <!-- Warm pool -->
      <rect width="100%" height="100%" fill="url(#warmPool)"/>
      <!-- Spotlight -->
      <rect width="100%" height="100%" fill="url(#spotLight)"/>
      <!-- Rim light -->
      <rect width="100%" height="100%" fill="url(#rimLight)"/>
      <!-- Deep vignette -->
      <rect width="100%" height="100%" fill="url(#luxVignette)"/>
    </svg>
  `;
}

// ─── Photographic Grain Overlay ──────────────────────

/**
 * Adds subtle photographic noise grain that makes the image look like
 * a real camera capture rather than a digital render.
 */
async function addPhotographicGrain(
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  // Create a small grain tile and tile it across the image
  const grainSize = 256;
  const grainSvg = `
    <svg width="${grainSize}" height="${grainSize}" xmlns="http://www.w3.org/2000/svg">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="5" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)"/>
    </svg>
  `;

  const grainBuffer = await sharp(Buffer.from(grainSvg))
    .resize(width, height)
    .png()
    .toBuffer();

  return sharp(buffer)
    .composite([
      {
        input: grainBuffer,
        blend: 'soft-light',
        opacity: 0.06,
      },
    ])
    .jpeg({ quality: 98 })
    .toBuffer();
}

// ─── Product Compositing ─────────────────────────────

export const createStudioBackdrop = createSeamlessStudioBackdrop;

/**
 * Composites the product cutout cleanly onto the seamless studio background,
 * centered and scaled to occupy ~70% of the canvas height with ambient occlusion.
 */
export async function compositeProductSeamlessly(
  cutoutBuffer: Buffer,
  backgroundBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number
): Promise<Buffer> {
  const bg = sharp(backgroundBuffer).resize(canvasWidth, canvasHeight, { fit: 'cover' });

  const maxW = Math.round(canvasWidth * 0.70);
  const maxH = Math.round(canvasHeight * 0.70);

  const resizedProduct = await sharp(cutoutBuffer)
    .resize(maxW, maxH, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();

  const productMeta = await sharp(resizedProduct).metadata();
  const pWidth = productMeta.width || maxW;
  const pHeight = productMeta.height || maxH;

  const left = Math.round((canvasWidth - pWidth) / 2);
  const top = Math.round((canvasHeight - pHeight) * 0.42);

  // Create ambient occlusion shadow — dark gradient at product base
  const aoHeight = Math.round(pHeight * 0.08);
  const aoSvg = `
    <svg width="${pWidth + 40}" height="${aoHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ao" cx="50%" cy="0%" rx="50%" ry="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.18"/>
          <stop offset="40%" stop-color="#000000" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#ao)"/>
    </svg>
  `;

  const aoBuffer = await sharp(Buffer.from(aoSvg))
    .blur(8)
    .png()
    .toBuffer();

  return bg
    .composite([
      // Ambient occlusion shadow (below product)
      {
        input: aoBuffer,
        left: Math.max(0, left - 20),
        top: Math.max(0, top + pHeight - 2),
        blend: 'multiply',
      },
      // Product on top
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

export const compositeProductOnBackground = compositeProductSeamlessly;
