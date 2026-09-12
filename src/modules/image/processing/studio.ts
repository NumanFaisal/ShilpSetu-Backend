import sharp from 'sharp';
import { aiService } from '../ai/ai.service';
import type { ProductSpecification, StudioStyle } from '../ai/ai.types';
import { enhanceCraftCutout } from './lighting';
import { env } from '../../../config/env';

export interface StudioReconstructionResult {
  studioBuffer: Buffer;
  style: string;
  detectedCraft: string;
  contextualBackdrop: string;
  method: string;
  promptUsed: string;
}

/**
 * Maps craft category, material, and requested style into an optimal contextual studio environment.
 */
export function resolveContextualStyle(
  productSpec?: ProductSpecification | null,
  requestedStyle: string = 'smart_contextual'
): {
  styleKey: string;
  name: string;
  contextDesc: string;
} {
  const normStyle = (requestedStyle || '').toLowerCase().trim();

  // Explicit user style selections
  if (normStyle === 'artisan_workshop' || normStyle === 'wooden_surface') {
    return {
      styleKey: 'artisan_workshop',
      name: 'Artisan Teak Workshop',
      contextDesc: 'Handcrafted teakwood workbench with natural wood grain, soft morning daylight, and authentic workshop atmosphere.',
    };
  }
  if (normStyle === 'heritage_courtyard') {
    return {
      styleKey: 'heritage_courtyard',
      name: 'Heritage Indian Courtyard',
      contextDesc: 'Traditional Indian carved sandstone archway and warm terracotta courtyard with soft golden ambient light.',
    };
  }
  if (normStyle === 'luxury_showcase' || normStyle === 'marble_surface' || normStyle === 'luxury') {
    return {
      styleKey: 'luxury_showcase',
      name: 'Luxury Marble Showcase',
      contextDesc: 'Polished Carrara marble with fine veining, royal silk drape backdrop, and warm editorial spotlight.',
    };
  }
  if (normStyle === 'clean_marketplace' || normStyle === 'white_studio') {
    return {
      styleKey: 'clean_marketplace',
      name: 'Clean E-Commerce Studio',
      contextDesc: 'Crisp commercial studio cyclorama with soft ambient diffusion and grounded contact reflection.',
    };
  }
  if (normStyle === 'botanical_lifestyle') {
    return {
      styleKey: 'botanical_lifestyle',
      name: '🌿 Lifestyle Studio with Botanical Elements',
      contextDesc: 'Warm natural tabletop with soft cream wall, gentle morning window light, and an aesthetic potted green plant in the soft background.',
    };
  }

  // Auto-detection based on craft type, material, and craftsmanship
  const type = (productSpec?.productType || '').toLowerCase();
  const material = (productSpec?.material || '').toLowerCase();
  const craft = (productSpec?.craftsmanship || '').toLowerCase();
  const allText = `${type} ${material} ${craft}`;

  if (
    allText.includes('basket') ||
    allText.includes('bucket') ||
    allText.includes('bowl') ||
    allText.includes('cane') ||
    allText.includes('bamboo') ||
    allText.includes('woven') ||
    allText.includes('jute') ||
    allText.includes('wicker') ||
    allText.includes('rope') ||
    allText.includes('planter')
  ) {
    return {
      styleKey: 'botanical_lifestyle',
      name: '🌿 Lifestyle Studio with Botanical Elements',
      contextDesc: 'Warm natural tabletop with soft cream wall, gentle morning window light, and an aesthetic potted green plant in the soft background.',
    };
  }

  if (
    allText.includes('clay') ||
    allText.includes('terracotta') ||
    allText.includes('pot') ||
    allText.includes('vase') ||
    allText.includes('earthen') ||
    allText.includes('ceramic')
  ) {
    return {
      styleKey: 'pottery_terracotta',
      name: 'Rustic Potter’s Workshop',
      contextDesc: 'Warm earthen potter’s studio with terracotta tile surface, natural clay dust textures, and warm sunlight from open courtyard.',
    };
  }

  if (
    allText.includes('silk') ||
    allText.includes('saree') ||
    allText.includes('textile') ||
    allText.includes('handloom') ||
    allText.includes('cotton') ||
    allText.includes('dupatta') ||
    allText.includes('shawl') ||
    allText.includes('embroidery') ||
    allText.includes('weave')
  ) {
    return {
      styleKey: 'textile_handloom',
      name: 'Artisan Textile Boutique',
      contextDesc: 'Warm natural teak display bench with textured organic linen runner, soft boutique daylight, and neutral craft atelier ambiance.',
    };
  }

  if (
    allText.includes('brass') ||
    allText.includes('metal') ||
    allText.includes('bronze') ||
    allText.includes('copper') ||
    allText.includes('dhokra') ||
    allText.includes('idol') ||
    allText.includes('statue') ||
    allText.includes('bell')
  ) {
    return {
      styleKey: 'heritage_courtyard',
      name: 'Heritage Temple Alcove',
      contextDesc: 'Hand-carved Indian sandstone niche with warm golden ambient luster that accentuates metallic craftwork.',
    };
  }

  if (
    allText.includes('jewelry') ||
    allText.includes('silver') ||
    allText.includes('gold') ||
    allText.includes('kundan') ||
    allText.includes('meenakari') ||
    allText.includes('gem') ||
    allText.includes('bangle') ||
    allText.includes('necklace')
  ) {
    return {
      styleKey: 'luxury_showcase',
      name: 'Luxury Velvet & Marble Showcase',
      contextDesc: 'Polished white Carrara marble with fine golden veining, rich royal silk drape, and focused jewelry spotlight.',
    };
  }

  // Default craft environment: warm artisan workbench
  return {
    styleKey: 'artisan_workshop',
    name: 'Artisan Craft Workshop',
    contextDesc: 'Authentic teakwood craftsman workbench with natural wood grain and warm directional window lighting.',
  };
}

/**
 * Reconstructs a contextual e-commerce studio environment tailored to the artisan craft.
 */
export async function reconstructStudioEnvironment(
  cleanedProductBuffer: Buffer,
  productSpec: ProductSpecification,
  style: StudioStyle | string = 'smart_contextual',
  options?: {
    batchId?: string | undefined;
    imageId?: string | undefined;
    targetWidth?: number | undefined;
    targetHeight?: number | undefined;
  }
): Promise<StudioReconstructionResult> {
  const targetW = options?.targetWidth ?? 2000;
  const targetH = options?.targetHeight ?? 2000;

  // 1. Resolve craft-contextual style
  const contextual = resolveContextualStyle(productSpec, style);
  const detectedCraft = productSpec?.productType || 'Artisan Craft';

  console.log(
    `[Studio] Reconstructing contextual studio for "${detectedCraft}" -> ${contextual.name} (${contextual.styleKey})`
  );

  // 2. Enhance product cutout with micro-texture sharpening & color vibrance
  const enhancedCutout = await enhanceCraftCutout(cleanedProductBuffer, {
    material: productSpec?.material,
    primaryColors: productSpec?.primaryColors,
    texture: productSpec?.texture,
    productType: productSpec?.productType,
  });

  // 3. Generate high-resolution contextual backdrop matching the craft
  const backdrop = await createSeamlessStudioBackdrop(contextual.styleKey, targetW, targetH);

  // 4. Composite enhanced craft onto contextual backdrop with multi-layer contact shadow
  const compositeBuffer = await compositeProductSeamlessly(
    enhancedCutout,
    backdrop,
    targetW,
    targetH,
    {
      surfaceType: contextual.styleKey,
    }
  );

  return {
    studioBuffer: compositeBuffer,
    style: contextual.styleKey,
    detectedCraft,
    contextualBackdrop: contextual.name,
    method: 'contextual_craft_studio',
    promptUsed: contextual.contextDesc,
  };
}

// ─── Realistic Studio Backdrops ──────────────────────

const backdropCache = new Map<string, Buffer>();

export async function createSeamlessStudioBackdrop(
  style: StudioStyle | string,
  width: number,
  height: number
): Promise<Buffer> {
  const cacheKey = `${style}_${width}_${height}`;
  if (backdropCache.has(cacheKey)) {
    return backdropCache.get(cacheKey)!;
  }

  let svgBg = '';

  switch (style) {
    case 'botanical_lifestyle':
      svgBg = createBotanicalLifestyleSVG(width, height);
      break;

    case 'pottery_terracotta':
      svgBg = createPotteryTerracottaSVG(width, height);
      break;

    case 'textile_handloom':
      svgBg = createTextileHandloomSVG(width, height);
      break;

    case 'heritage_courtyard':
      svgBg = createHeritageCourtyardSVG(width, height);
      break;

    case 'luxury_showcase':
    case 'marble_surface':
    case 'luxury':
      svgBg = createMarbleSurfaceSVG(width, height);
      break;

    case 'clean_marketplace':
    case 'white_studio':
      svgBg = createWhiteStudioSVG(width, height);
      break;

    case 'artisan_workshop':
    case 'wooden_surface':
    default:
      svgBg = createWoodSurfaceSVG(width, height);
      break;
  }

  // Render SVG to sharp buffer
  let baseBuffer = await sharp(Buffer.from(svgBg))
    .resize(width, height)
    .jpeg({ quality: 98 })
    .toBuffer();

  // Add subtle photographic noise grain for realism
  baseBuffer = await addPhotographicGrain(baseBuffer, width, height);

  backdropCache.set(cacheKey, baseBuffer);
  return baseBuffer;
}

// ─── 0. Lifestyle Studio with Botanical Elements (Potted Plant, Warm Table) ───

function createBotanicalLifestyleSVG(width: number, height: number): string {
  const tableY = Math.round(height * 0.53);
  const tableH = height - tableY;

  // Position of background potted plant (softly out of focus on the left)
  const potW = Math.round(width * 0.08);
  const potH = Math.round(height * 0.12);
  const potX = Math.round(width * 0.09);
  const potY = Math.round(tableY - potH * 0.78);

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Warm minimalist wall background -->
        <linearGradient id="lifestyleWall" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FCF9F5"/>
          <stop offset="40%" stop-color="#F5ECE1"/>
          <stop offset="100%" stop-color="#E9DDD0"/>
        </linearGradient>

        <!-- Smooth natural warm wooden/stone tabletop surface -->
        <linearGradient id="lifestyleTable" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#EFE6DC"/>
          <stop offset="30%" stop-color="#E4D7CA"/>
          <stop offset="70%" stop-color="#D6C4B4"/>
          <stop offset="100%" stop-color="#C5B19E"/>
        </linearGradient>

        <!-- Table grain texture -->
        <filter id="tableGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.005" numOctaves="3" seed="89" stitchTiles="stitch" result="grain"/>
          <feColorMatrix type="saturate" values="0" in="grain" result="grayGrain"/>
          <feBlend in="SourceGraphic" in2="grayGrain" mode="soft-light"/>
        </filter>

        <!-- Natural morning window daylight beam from upper-left -->
        <linearGradient id="morningLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.32"/>
          <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="85%" stop-color="#000000" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.15"/>
        </linearGradient>

        <!-- Soft depth-of-field blur for background plant element -->
        <filter id="dofPlantBlur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.8"/>
        </filter>

        <!-- Minimalist ceramic white flower pot -->
        <linearGradient id="whitePot" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#E2DDD5"/>
          <stop offset="35%" stop-color="#FFFFFF"/>
          <stop offset="75%" stop-color="#F3EFEB"/>
          <stop offset="100%" stop-color="#CDC6BD"/>
        </linearGradient>

        <!-- Lush botanical leaves gradients -->
        <linearGradient id="leafDeep" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#416135"/>
          <stop offset="100%" stop-color="#2D4524"/>
        </linearGradient>
        <linearGradient id="leafMid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5E874D"/>
          <stop offset="100%" stop-color="#3D5C31"/>
        </linearGradient>
        <linearGradient id="leafFresh" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#84AC6F"/>
          <stop offset="100%" stop-color="#507840"/>
        </linearGradient>

        <!-- Subtle depth vignette -->
        <radialGradient id="lifestyleVignette" cx="50%" cy="48%" r="65%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0.03"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
        </radialGradient>
      </defs>

      <!-- Background wall -->
      <rect width="100%" height="100%" fill="url(#lifestyleWall)"/>

      <!-- Tabletop ground plane -->
      <rect y="${tableY}" width="100%" height="${tableH}" fill="url(#lifestyleTable)"/>
      <rect y="${tableY}" width="100%" height="${tableH}" filter="url(#tableGrain)" opacity="0.25"/>

      <!-- Horizon line with subtle depth shadow -->
      <line x1="0" y1="${tableY}" x2="${width}" y2="${tableY}" stroke="#B8A798" stroke-width="2" opacity="0.45"/>
      <rect y="${tableY}" width="100%" height="14" fill="black" opacity="0.04"/>

      <!-- Aesthetic Little Element: Potted Plant in the Background on the left with subtle depth blur -->
      <g filter="url(#dofPlantBlur)" opacity="0.88">
        <!-- Pot contact shadow on table -->
        <ellipse cx="${potX + potW * 0.5}" cy="${potY + potH + 4}" rx="${potW * 0.6}" ry="${potH * 0.14}" fill="#000000" opacity="0.25"/>

        <!-- Ceramic Pot Body -->
        <path d="M ${potX + potW * 0.12} ${potY + potH} 
                 L ${potX + potW * 0.88} ${potY + potH} 
                 L ${potX + potW} ${potY + potH * 0.15} 
                 L ${potX} ${potY + potH * 0.15} Z" 
              fill="url(#whitePot)"/>
        <!-- Pot Rim -->
        <ellipse cx="${potX + potW * 0.5}" cy="${potY + potH * 0.15}" rx="${potW * 0.5}" ry="${potH * 0.12}" fill="#F0EDE7"/>
        <ellipse cx="${potX + potW * 0.5}" cy="${potY + potH * 0.16}" rx="${potW * 0.42}" ry="${potH * 0.09}" fill="#54473C"/>

        <!-- Plant Stems & Lush Leaves -->
        <!-- Center Stem -->
        <path d="M ${potX + potW * 0.5} ${potY + potH * 0.15} Q ${potX + potW * 0.48} ${potY - potH * 0.6} ${potX + potW * 0.52} ${potY - potH * 1.3}" stroke="#3A562D" stroke-width="3.5" fill="none"/>
        <!-- Left Arching Stem -->
        <path d="M ${potX + potW * 0.45} ${potY + potH * 0.12} Q ${potX + potW * 0.1} ${potY - potH * 0.4} ${potX - potW * 0.3} ${potY - potH * 0.9}" stroke="#446636" stroke-width="3" fill="none"/>
        <!-- Right Arching Stem -->
        <path d="M ${potX + potW * 0.55} ${potY + potH * 0.12} Q ${potX + potW * 0.9} ${potY - potH * 0.4} ${potX + potW * 1.25} ${potY - potH * 0.8}" stroke="#446636" stroke-width="3" fill="none"/>

        <!-- Elegant Leaves spreading gracefully -->
        <!-- Top Leaf -->
        <path d="M ${potX + potW * 0.52} ${potY - potH * 1.3} C ${potX + potW * 0.3} ${potY - potH * 1.7} ${potX + potW * 0.7} ${potY - potH * 1.7} ${potX + potW * 0.52} ${potY - potH * 1.3} Z" fill="url(#leafFresh)"/>
        <!-- Top Left Leaves -->
        <path d="M ${potX + potW * 0.46} ${potY - potH * 0.95} C ${potX + potW * 0.1} ${potY - potH * 1.3} ${potX + potW * 0.25} ${potY - potH * 1.45} ${potX + potW * 0.46} ${potY - potH * 0.95} Z" fill="url(#leafMid)"/>
        <path d="M ${potX - potW * 0.3} ${potY - potH * 0.9} C ${potX - potW * 0.6} ${potY - potH * 1.2} ${potX - potW * 0.3} ${potY - potH * 1.35} ${potX - potW * 0.3} ${potY - potH * 0.9} Z" fill="url(#leafDeep)"/>
        <!-- Left Mid Leaf -->
        <path d="M ${potX + potW * 0.2} ${potY - potH * 0.5} C ${potX - potW * 0.3} ${potY - potH * 0.65} ${potX - potW * 0.2} ${potY - potH * 0.9} ${potX + potW * 0.2} ${potY - potH * 0.5} Z" fill="url(#leafMid)"/>
        <!-- Top Right Leaves -->
        <path d="M ${potX + potW * 0.55} ${potY - potH * 0.85} C ${potX + potW * 0.9} ${potY - potH * 1.15} ${potX + potW * 0.8} ${potY - potH * 1.3} ${potX + potW * 0.55} ${potY - potH * 0.85} Z" fill="url(#leafFresh)"/>
        <path d="M ${potX + potW * 1.25} ${potY - potH * 0.8} C ${potX + potW * 1.6} ${potY - potH * 1.05} ${potX + potW * 1.45} ${potY - potH * 1.2} ${potX + potW * 1.25} ${potY - potH * 0.8} Z" fill="url(#leafMid)"/>
        <!-- Lower Bush Leaves -->
        <path d="M ${potX + potW * 0.75} ${potY - potH * 0.25} C ${potX + potW * 1.2} ${potY - potH * 0.4} ${potX + potW * 1.1} ${potY - potH * 0.6} ${potX + potW * 0.75} ${potY - potH * 0.25} Z" fill="url(#leafDeep)"/>
        <path d="M ${potX + potW * 0.3} ${potY - potH * 0.15} C ${potX - potW * 0.1} ${potY - potH * 0.25} ${potX - potW * 0.05} ${potY - potH * 0.45} ${potX + potW * 0.3} ${potY - potH * 0.15} Z" fill="url(#leafFresh)"/>
      </g>

      <!-- Directional Morning Window Sunlight Beam -->
      <rect width="100%" height="100%" fill="url(#morningLight)"/>

      <!-- Soft studio vignette -->
      <rect width="100%" height="100%" fill="url(#lifestyleVignette)"/>
    </svg>
  `;
}

// ─── 1. Pottery & Terracotta Studio Backdrop ─────────

function createPotteryTerracottaSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Wall / Courtyard depth background -->
        <linearGradient id="terracottaWall" x1="0%" y1="0%" x2="0%" y2="60%">
          <stop offset="0%" stop-color="#EAD6C3"/>
          <stop offset="40%" stop-color="#DEBEA5"/>
          <stop offset="100%" stop-color="#C99E7F"/>
        </linearGradient>

        <!-- Potter's workbench surface (lower 45%) -->
        <linearGradient id="potterSurface" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#C87A54"/>
          <stop offset="25%" stop-color="#BA6A43"/>
          <stop offset="60%" stop-color="#A2542E"/>
          <stop offset="100%" stop-color="#843E1B"/>
        </linearGradient>

        <!-- Fine clay dust texture -->
        <filter id="clayDust" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.035" numOctaves="4" seed="81" stitchTiles="stitch" result="dust"/>
          <feColorMatrix type="saturate" values="0" in="dust" result="grayDust"/>
          <feBlend in="SourceGraphic" in2="grayDust" mode="soft-light"/>
        </filter>

        <!-- Warm natural morning sunlight from upper-left -->
        <linearGradient id="sunbeamLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF5EA" stop-opacity="0.28"/>
          <stop offset="45%" stop-color="#FFEED6" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.15"/>
        </linearGradient>

        <!-- Ambient warmth pool -->
        <radialGradient id="terracottaWarmth" cx="45%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#FFB380" stop-opacity="0.15"/>
          <stop offset="60%" stop-color="#FF9550" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>

        <!-- Depth Vignette -->
        <radialGradient id="potteryVignette" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
        </radialGradient>
      </defs>

      <!-- Background wall -->
      <rect width="100%" height="100%" fill="url(#terracottaWall)"/>
      <!-- Potter's workbench surface ground plane -->
      <rect y="${Math.round(height * 0.52)}" width="100%" height="${Math.round(height * 0.48)}" fill="url(#potterSurface)"/>
      <rect y="${Math.round(height * 0.52)}" width="100%" height="${Math.round(height * 0.48)}" filter="url(#clayDust)" opacity="0.6"/>
      <!-- Horizon crease / shadow -->
      <line x1="0" y1="${Math.round(height * 0.52)}" x2="${width}" y2="${Math.round(height * 0.52)}" stroke="#7A3918" stroke-width="3" opacity="0.5"/>
      <!-- Sunbeam & natural daylight -->
      <rect width="100%" height="100%" fill="url(#sunbeamLight)"/>
      <!-- Warmth -->
      <rect width="100%" height="100%" fill="url(#terracottaWarmth)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#potteryVignette)"/>
    </svg>
  `;
}

// ─── 2. Textile & Handloom Studio Backdrop ───────────

function createTextileHandloomSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Soft neutral khadi wall background -->
        <linearGradient id="textileWall" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FBF8F3"/>
          <stop offset="45%" stop-color="#F3ECE0"/>
          <stop offset="100%" stop-color="#E5D9CA"/>
        </linearGradient>

        <!-- Teak display bench surface -->
        <linearGradient id="textileBench" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#A57A4C"/>
          <stop offset="50%" stop-color="#B7895A"/>
          <stop offset="100%" stop-color="#9A6F42"/>
        </linearGradient>

        <!-- Woven fabric texture overlay -->
        <filter id="linenWeave" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08 0.08" numOctaves="3" seed="14" stitchTiles="stitch" result="weave"/>
          <feColorMatrix type="saturate" values="0" in="weave" result="grayWeave"/>
          <feBlend in="SourceGraphic" in2="grayWeave" mode="soft-light"/>
        </filter>

        <!-- Boutique daylight from right -->
        <radialGradient id="boutiqueLight" cx="65%" cy="30%" r="60%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.25"/>
          <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.08"/>
        </radialGradient>

        <!-- Subtle depth vignette -->
        <radialGradient id="textileVignette" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="70%" stop-color="#000000" stop-opacity="0.02"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>
        </radialGradient>
      </defs>

      <!-- Khadi wall -->
      <rect width="100%" height="100%" fill="url(#textileWall)"/>
      <rect width="100%" height="100%" filter="url(#linenWeave)" opacity="0.3"/>
      <!-- Teak wooden surface plane -->
      <rect y="${Math.round(height * 0.55)}" width="100%" height="${Math.round(height * 0.45)}" fill="url(#textileBench)"/>
      <!-- Horizon line -->
      <line x1="0" y1="${Math.round(height * 0.55)}" x2="${width}" y2="${Math.round(height * 0.55)}" stroke="#7E5429" stroke-width="2" opacity="0.4"/>
      <!-- Soft boutique lighting -->
      <rect width="100%" height="100%" fill="url(#boutiqueLight)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#textileVignette)"/>
    </svg>
  `;
}

// ─── 3. Heritage Indian Courtyard & Sandstone Alcove ─

function createHeritageCourtyardSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Sandstone archway background -->
        <radialGradient id="sandstoneArch" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#D69F6E"/>
          <stop offset="35%" stop-color="#BD8253"/>
          <stop offset="70%" stop-color="#9C6237"/>
          <stop offset="100%" stop-color="#6F3F1E"/>
        </radialGradient>

        <!-- Antique stone surface plane -->
        <linearGradient id="stoneSurface" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#98643C"/>
          <stop offset="40%" stop-color="#804D27"/>
          <stop offset="100%" stop-color="#5B3213"/>
        </linearGradient>

        <!-- Chiseled stone texture -->
        <filter id="chiseledStone" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.02 0.02" numOctaves="5" seed="55" stitchTiles="stitch" result="stone"/>
          <feColorMatrix type="saturate" values="0" in="stone" result="grayStone"/>
          <feBlend in="SourceGraphic" in2="grayStone" mode="multiply"/>
        </filter>

        <!-- Golden temple diya / warm luster glow -->
        <radialGradient id="goldenLuster" cx="48%" cy="48%" r="45%">
          <stop offset="0%" stop-color="#FFE0A0" stop-opacity="0.32"/>
          <stop offset="45%" stop-color="#FFA845" stop-opacity="0.14"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>

        <!-- Rich contrast vignette -->
        <radialGradient id="heritageVignette" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.38"/>
        </radialGradient>
      </defs>

      <!-- Sandstone background -->
      <rect width="100%" height="100%" fill="url(#sandstoneArch)"/>
      <rect width="100%" height="100%" filter="url(#chiseledStone)" opacity="0.35"/>
      <!-- Stone surface plane -->
      <rect y="${Math.round(height * 0.54)}" width="100%" height="${Math.round(height * 0.46)}" fill="url(#stoneSurface)"/>
      <line x1="0" y1="${Math.round(height * 0.54)}" x2="${width}" y2="${Math.round(height * 0.54)}" stroke="#46240B" stroke-width="3" opacity="0.6"/>
      <!-- Golden luster for metal & brass -->
      <rect width="100%" height="100%" fill="url(#goldenLuster)"/>
      <!-- Vignette -->
      <rect width="100%" height="100%" fill="url(#heritageVignette)"/>
    </svg>
  `;
}

// ─── 4. White Studio — Clean cyclorama with soft lighting ─

function createWhiteStudioSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cycMain" cx="48%" cy="38%" r="72%" fx="45%" fy="35%">
          <stop offset="0%" stop-color="#FEFEFE"/>
          <stop offset="15%" stop-color="#FBFBFC"/>
          <stop offset="35%" stop-color="#F5F6F8"/>
          <stop offset="55%" stop-color="#ECEEF1"/>
          <stop offset="75%" stop-color="#DFE2E7"/>
          <stop offset="90%" stop-color="#D0D4DA"/>
          <stop offset="100%" stop-color="#C2C7CF"/>
        </radialGradient>
        <radialGradient id="keyLight" cx="32%" cy="22%" r="55%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
          <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="fillLight" cx="75%" cy="45%" r="40%">
          <stop offset="0%" stop-color="#F8F9FA" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#F8F9FA" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="floorDepth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="85%" stop-color="#000000" stop-opacity="0.025"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.06"/>
        </linearGradient>
        <radialGradient id="vignette" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="70%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.08"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#cycMain)"/>
      <rect width="100%" height="100%" fill="url(#keyLight)"/>
      <rect width="100%" height="100%" fill="url(#fillLight)"/>
      <rect width="100%" height="100%" fill="url(#floorDepth)"/>
      <rect width="100%" height="100%" fill="url(#vignette)"/>
    </svg>
  `;
}

// ─── 5. Wood Surface — Realistic wood grain texture ─────

function createWoodSurfaceSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="woodBase" x1="0%" y1="0%" x2="100%" y2="85%">
          <stop offset="0%" stop-color="#C49A6C"/>
          <stop offset="20%" stop-color="#B8895A"/>
          <stop offset="45%" stop-color="#A67B4B"/>
          <stop offset="70%" stop-color="#9A7042"/>
          <stop offset="100%" stop-color="#8B6238"/>
        </linearGradient>
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
        <linearGradient id="windowLight" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>
          <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.05"/>
        </linearGradient>
        <radialGradient id="woodVignette" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.12"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#woodBase)"/>
      <rect width="100%" height="100%" filter="url(#woodGrain)"/>
      <rect width="100%" height="100%" fill="url(#windowLight)"/>
      <rect width="100%" height="100%" fill="url(#woodVignette)"/>
    </svg>
  `;
}

// ─── 6. Marble Surface — Carrara with veining ──────────

function createMarbleSurfaceSVG(width: number, height: number): string {
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="marbleBase" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stop-color="#F2F0ED"/>
          <stop offset="25%" stop-color="#ECEAE6"/>
          <stop offset="50%" stop-color="#E5E3DF"/>
          <stop offset="75%" stop-color="#DDDBD7"/>
          <stop offset="100%" stop-color="#D5D2CD"/>
        </radialGradient>
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
        <linearGradient id="polishSheen" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.03"/>
        </linearGradient>
        <radialGradient id="marbleLight" cx="42%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="marbleVignette" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.1"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#marbleBase)"/>
      <rect width="100%" height="100%" filter="url(#marbleVeins)"/>
      <rect width="100%" height="100%" fill="url(#polishSheen)"/>
      <rect width="100%" height="100%" fill="url(#marbleLight)"/>
      <rect width="100%" height="100%" fill="url(#marbleVignette)"/>
    </svg>
  `;
}

// ─── Photographic Grain Overlay ──────────────────────

async function addPhotographicGrain(
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
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
      },
    ])
    .jpeg({ quality: 98 })
    .toBuffer();
}

// ─── Seamless Multi-Layer Product Compositing ────────

export const createStudioBackdrop = createSeamlessStudioBackdrop;

/**
 * Composites the enhanced product cutout onto the contextual background with
 * realistic multi-layer contact shadow, ambient occlusion, and surface grounding.
 */
export async function compositeProductSeamlessly(
  cutoutBuffer: Buffer,
  backgroundBuffer: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  options?: { surfaceType?: string }
): Promise<Buffer> {
  const bg = sharp(backgroundBuffer).resize(canvasWidth, canvasHeight, { fit: 'cover' });

  // Scale product to take ~72% of canvas height
  const maxW = Math.round(canvasWidth * 0.72);
  const maxH = Math.round(canvasHeight * 0.72);

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

  // 1. Dark ambient occlusion core (tight shadow directly below base contact points)
  const aoWidth = Math.round(pWidth * 0.85);
  const aoHeight = Math.max(16, Math.round(pHeight * 0.08));
  const aoSvg = `
    <svg width="${aoWidth}" height="${aoHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ao" cx="50%" cy="20%" rx="50%" ry="80%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.32"/>
          <stop offset="40%" stop-color="#000000" stop-opacity="0.16"/>
          <stop offset="85%" stop-color="#000000" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#ao)"/>
    </svg>
  `;
  const aoBuffer = await sharp(Buffer.from(aoSvg)).blur(6).png().toBuffer();

  // 2. Soft diffused ground pool shadow (spreads natural shadow across the surface plane)
  const poolWidth = Math.round(pWidth * 1.05);
  const poolHeight = Math.max(24, Math.round(pHeight * 0.16));
  const poolSvg = `
    <svg width="${poolWidth}" height="${poolHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="pool" cx="50%" cy="30%" rx="50%" ry="70%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.22"/>
          <stop offset="45%" stop-color="#000000" stop-opacity="0.10"/>
          <stop offset="80%" stop-color="#000000" stop-opacity="0.02"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${Math.round(poolWidth / 2)}" cy="${Math.round(poolHeight / 2)}" rx="${Math.round(poolWidth * 0.48)}" ry="${Math.round(poolHeight * 0.45)}" fill="url(#pool)"/>
    </svg>
  `;
  const poolBuffer = await sharp(Buffer.from(poolSvg)).blur(14).png().toBuffer();

  const compositeLayers: sharp.OverlayOptions[] = [
    // Diffused ground shadow
    {
      input: poolBuffer,
      left: Math.max(0, Math.round(left + (pWidth - poolWidth) / 2)),
      top: Math.max(0, Math.round(top + pHeight - poolHeight * 0.45)),
      blend: 'multiply',
    },
    // Tight ambient occlusion shadow
    {
      input: aoBuffer,
      left: Math.max(0, Math.round(left + (pWidth - aoWidth) / 2)),
      top: Math.max(0, Math.round(top + pHeight - aoHeight * 0.55)),
      blend: 'multiply',
    },
    // Enhanced product on top
    {
      input: resizedProduct,
      left: Math.max(0, left),
      top: Math.max(0, top),
      blend: 'over',
    },
  ];

  return bg.composite(compositeLayers).png().toBuffer();
}

export const compositeProductOnBackground = compositeProductSeamlessly;
