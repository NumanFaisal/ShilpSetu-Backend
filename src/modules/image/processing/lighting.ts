import sharp from 'sharp';
import { aiService } from '../ai/ai.service';
import type { ExposureAdjustment } from '../ai/ai.types';

export interface LightingOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  autoDetect?: boolean;
  /** Product-specific guidance from Gemini / craft analysis */
  productHints?: {
    material?: string;
    primaryColors?: string[];
    texture?: string;
    productType?: string;
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
}

/**
 * Enhances the craft product cutout directly to highlight handmade artistry:
 * - Restores and sharpens intricate textures (weaves, carvings, engravings, clay finish)
 * - Enhances natural dye saturation and vibrancy
 * - Balances dynamic range so shadows are lifted and highlights are preserved
 */
export async function enhanceCraftCutout(
  cutoutBuffer: Buffer,
  productHints?: LightingOptions['productHints']
): Promise<Buffer> {
  const material = (productHints?.material || '').toLowerCase();
  const productType = (productHints?.productType || '').toLowerCase();

  let brightness = productHints?.brightness ?? 1.05;
  let saturation = productHints?.saturation ?? 1.10;
  let contrast = productHints?.contrast ?? 1.08;
  let sharpenSigma = 1.3;
  let sharpenM1 = 1.6;
  let sharpenM2 = 0.5;

  if (material.includes('clay') || material.includes('terracotta') || material.includes('pottery') || productType.includes('pot') || productType.includes('vase')) {
    // Warm earthy clay: enhance warm tones, sharpen fine clay dust & etched ridges
    brightness = 1.04;
    saturation = 1.12;
    contrast = 1.10;
    sharpenSigma = 1.4;
    sharpenM1 = 1.8;
  } else if (material.includes('brass') || material.includes('metal') || material.includes('copper') || material.includes('bronze') || material.includes('gold')) {
    // Metallic craft: boost luster, specular contrast, sharp metallic edges
    brightness = 1.06;
    saturation = 1.08;
    contrast = 1.15;
    sharpenSigma = 1.2;
    sharpenM1 = 2.0;
  } else if (material.includes('silk') || material.includes('textile') || material.includes('cotton') || material.includes('fabric') || productType.includes('saree')) {
    // Handloom & textile: boost authentic dye vibrance, reveal weave threads
    brightness = 1.03;
    saturation = 1.15;
    contrast = 1.07;
    sharpenSigma = 1.1;
    sharpenM1 = 1.4;
  } else if (
    material.includes('cane') ||
    material.includes('bamboo') ||
    material.includes('woven') ||
    material.includes('jute') ||
    productType.includes('basket') ||
    productType.includes('bucket') ||
    productType.includes('bowl')
  ) {
    // Woven cane / bamboo basket: high micro-contrast to delineate weave strands,
    // rich warm honey-gold tone boost (+15% saturation), sharpen strand braiding & rim
    brightness = 1.05;
    saturation = 1.15;
    contrast = 1.12;
    sharpenSigma = 1.4;
    sharpenM1 = 2.0;
  } else if (material.includes('wood') || material.includes('timber')) {
    // Natural wood: enhance natural grain contrast and honey/amber warmth
    brightness = 1.05;
    saturation = 1.10;
    contrast = 1.10;
    sharpenSigma = 1.3;
    sharpenM1 = 1.6;
  } else if (material.includes('jewelry') || material.includes('stone') || material.includes('kundan') || material.includes('pearl')) {
    // Fine jewelry: high clarity, crisp gemstone facets
    brightness = 1.07;
    saturation = 1.06;
    contrast = 1.14;
    sharpenSigma = 1.0;
    sharpenM1 = 2.2;
  }

  let img = sharp(cutoutBuffer)
    .modulate({
      brightness,
      saturation,
    })
    .sharpen({
      sigma: sharpenSigma,
      m1: sharpenM1,
      m2: sharpenM2,
    });

  // Apply subtle contrast curve
  if (Math.abs(contrast - 1.0) > 0.01) {
    const a = contrast;
    const b = (1 - a) * 127.5;
    img = img.linear(a, b);
  }

  return img.png().toBuffer();
}

/**
 * Adjusts environmental lighting, exposure, and color temperature on the composited scene
 * to harmonize product with background environment.
 */
export async function adjustLightingAndExposure(
  imageBuffer: Buffer,
  options: LightingOptions = {}
): Promise<Buffer> {
  let brightness = options.brightness ?? 1.03;
  let contrast = options.contrast ?? 1.04;
  let saturation = options.saturation ?? 1.02;

  if (options.productHints?.material) {
    const mat = options.productHints.material.toLowerCase();
    if (mat.includes('clay') || mat.includes('terracotta') || mat.includes('pottery')) {
      brightness = 1.02;
      contrast = 1.05;
      saturation = 1.03;
    } else if (mat.includes('wood') || mat.includes('bamboo') || mat.includes('cane')) {
      brightness = 1.03;
      contrast = 1.04;
      saturation = 1.02;
    } else if (mat.includes('brass') || mat.includes('metal') || mat.includes('copper')) {
      brightness = 1.04;
      contrast = 1.06;
      saturation = 1.02;
    } else if (mat.includes('silk') || mat.includes('textile') || mat.includes('cotton')) {
      brightness = 1.02;
      contrast = 1.03;
      saturation = 1.04;
    }
  } else if (options.autoDetect) {
    try {
      const adjustment: ExposureAdjustment = await aiService.analyzeLighting(imageBuffer);
      brightness = adjustment.brightness;
      contrast = adjustment.contrast ?? 1.05;
      saturation = adjustment.saturation;
      console.log(
        `[Lighting] AI analysis → brightness=${brightness.toFixed(3)}, contrast=${contrast.toFixed(3)}, saturation=${saturation.toFixed(3)}`
      );
    } catch (err: any) {
      console.warn(`[Lighting] AI analysis fallback:`, err.message);
    }
  }

  brightness = Math.min(1.15, Math.max(0.85, brightness));
  contrast = Math.min(1.2, Math.max(0.9, contrast));
  saturation = Math.min(1.1, Math.max(0.9, saturation));

  let result = sharp(imageBuffer)
    .modulate({
      brightness,
      saturation,
    });

  if (Math.abs(contrast - 1.0) > 0.01) {
    const a = contrast;
    const b = (1 - a) * 127.5;
    result = result.linear(a, b);
  }

  return result.png().toBuffer();
}

/**
 * Enhances the craft image using Gemini API vision analysis to optimize lighting,
 * contrast, dye vibrance, and texture clarity according to the authentic artisan craft.
 */
export async function enhanceCraftImageWithGemini(
  imageBuffer: Buffer,
  productHints?: LightingOptions['productHints']
): Promise<Buffer> {
  try {
    const adjustment = await aiService.analyzeLighting(imageBuffer);
    return enhanceCraftCutout(imageBuffer, {
      ...productHints,
      brightness: adjustment.brightness,
      contrast: adjustment.contrast,
      saturation: adjustment.saturation,
    });
  } catch (err: any) {
    console.warn('[Lighting] Gemini enhancement fallback to craft heuristics:', err?.message || err);
    return enhanceCraftCutout(imageBuffer, productHints);
  }
}
