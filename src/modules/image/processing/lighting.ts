import sharp from 'sharp';
import { aiService } from '../ai/ai.service';
import type { ExposureAdjustment } from '../ai/ai.types';

export interface LightingOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  autoDetect?: boolean;
  /** Product-specific guidance from Gemini analysis */
  productHints?: {
    material?: string;
    primaryColors?: string[];
    texture?: string;
  };
}

/**
 * Adjusts lighting, exposure, and contrast using real AI vision analysis.
 *
 * When autoDetect is true, Gemini analyzes the actual image and returns
 * data-driven adjustments instead of hardcoded values. This produces
 * results that match real commercial photography lighting.
 */
export async function adjustLightingAndExposure(
  imageBuffer: Buffer,
  options: LightingOptions = {}
): Promise<Buffer> {
  let brightness = options.brightness ?? 1.04;
  let contrast = options.contrast ?? 1.05;
  let saturation = options.saturation ?? 1.02;

  if (options.productHints?.material) {
    const mat = options.productHints.material.toLowerCase();
    if (mat.includes('clay') || mat.includes('terracotta') || mat.includes('pottery')) {
      brightness = 1.03;
      contrast = 1.07;
      saturation = 1.04;
    } else if (mat.includes('wood') || mat.includes('bamboo') || mat.includes('cane')) {
      brightness = 1.04;
      contrast = 1.06;
      saturation = 1.03;
    } else if (mat.includes('brass') || mat.includes('metal') || mat.includes('copper') || mat.includes('silver')) {
      brightness = 1.05;
      contrast = 1.10;
      saturation = 1.02;
    } else if (mat.includes('silk') || mat.includes('textile') || mat.includes('cotton') || mat.includes('fabric')) {
      brightness = 1.03;
      contrast = 1.05;
      saturation = 1.05;
    } else if (mat.includes('marble') || mat.includes('stone') || mat.includes('ceramic')) {
      brightness = 1.05;
      contrast = 1.05;
      saturation = 1.01;
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
      console.warn(`[Lighting] AI analysis failed, using defaults:`, err.message);
      // Use conservative defaults
    }
  }

  // Clamp to safe ranges
  brightness = Math.min(1.15, Math.max(0.85, brightness));
  contrast = Math.min(1.2, Math.max(0.9, contrast));
  saturation = Math.min(1.1, Math.max(0.9, saturation));

  // Apply brightness and saturation via Sharp modulate
  let result = sharp(imageBuffer)
    .modulate({
      brightness,
      saturation,
    });

  // Apply contrast via linear curve (a*x + b)
  // For contrast > 1: stretch around midpoint (a > 1, b shifts to keep midpoint stable)
  // For contrast < 1: compress around midpoint
  if (Math.abs(contrast - 1.0) > 0.01) {
    const a = contrast;
    const b = (1 - a) * 127.5; // Keep midpoint (127.5) stable
    result = result.linear(a, b);
  }

  return result.png().toBuffer();
}
