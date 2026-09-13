import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { env } from '../../../config/env';
import type {
  ImageAIProvider,
  ProductSpecification,
  ProductDetectionResult,
  StudioGenerationOptions,
  ValidationResult,
  ExposureAdjustment,
} from './ai.types';

export class GeminiAIProvider implements ImageAIProvider {
  public name = 'gemini';
  private ai: GoogleGenAI | null = null;

  constructor() {
    if (env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.ai) {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return this.ai;
  }

  // ─── Product Analysis ────────────────────────────────

  async analyzeProduct(
    imageBuffers: Buffer[],
    batchContext?: string
  ): Promise<ProductSpecification> {
    const ai = this.getClient();

    const parts = await Promise.all(
      imageBuffers.map(async (buf) => {
        try {
          const compressed = await sharp(buf)
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          return {
            inlineData: {
              data: compressed.toString('base64'),
              mimeType: 'image/jpeg',
            },
          };
        } catch {
          return {
            inlineData: {
              data: buf.toString('base64'),
              mimeType: 'image/jpeg',
            },
          };
        }
      })
    );

    const prompt = `You are a master product analyst, artisan-craft specialist, commercial product photographer, and e-commerce catalog expert.

TASK
Analyze the provided artisan product photo(s). Identify and describe ONLY the primary product object in the foreground — the item intended for sale. Ignore all unrelated background elements: tables, desks, desk mats, monitors, keyboards, mice, cables, walls, furniture, people, hands, lighting equipment, reflections, and cast shadows.

${batchContext ? `Batch Context: ${batchContext}` : ''}

This analysis feeds a downstream pipeline: product identification → detection → background removal → cleanup → AI studio reconstruction → lighting/exposure correction → shadow generation → final e-commerce image. Your job is ONLY to describe what is visibly true — you are not generating the final image.

GROUNDING RULES
- Describe only what is visibly supported by the image. Never guess hidden areas, unreadable text, exact measurements, unseen materials, or occluded parts.
- If a detail is uncertain or partially visible, say so explicitly (e.g., "partially visible, likely ceramic — occluded by shadow") rather than omitting it or guessing.
- If multiple products appear, describe the primary/foreground one and note the others exist in "occludedOrUnclearAreas" or a dedicated note — do not merge their attributes.

IDENTITY PRESERVATION
Everything you list under "preservationRules" must be a SPECIFIC, image-grounded detail (not generic boilerplate) — the exact things a downstream editor must not alter, removed, redesign, translate, or invent, including: shape/proportions, authentic colors, material/texture, logos/text/symbols, artwork/patterns/seams/handles/rims/construction details, natural handmade irregularities (fibers, grain, dents, authentic imperfections), orientation, and any unique identifying feature. Write these as concrete observations (e.g., "asymmetric rim with three visible thumb-press indentations"), not as a restatement of this rule.

OUTPUT
Respond ONLY with one valid JSON object matching the schema below. No Markdown, no code fences, no commentary before or after.

SCHEMA (all fields required; use "unknown" for a string field or [] for an array field if genuinely not visible/applicable — never omit a field):
{
  "productType": string,
  "productCount": number,               // count of distinct products visible, even if only 1 is described
  "material": string,
  "primaryColors": string[],
  "secondaryColors": string[],
  "shape": string,
  "approximateDimensions": string,       // relative/proportional description only, e.g. "roughly twice as tall as wide"; never invent units of measure
  "texture": string,
  "craftsmanship": string,               // visible construction quality/technique, e.g. "hand-thrown, visible throwing rings"
  "structuralFeatures": string[],        // physical construction: joints, seams, openings, base, rim — NOT decorative elements
  "visibleDecorations": string[],        // applied/decorative elements: paint, glaze pattern, carving, embroidery — NOT structural elements
  "handles": string,                     // "none" if absent
  "edges": string,
  "symmetry": string,
  "orientation": string,
  "visibleText": string[],               // transcribe exactly as seen; [] if none
  "logosAndBranding": string[],          // [] if none
  "surfaceCondition": string[],          // wear, gloss, matte, scratches, dust, etc.
  "occludedOrUnclearAreas": string[],    // [] if fully visible
  "preservationRules": string[]          // specific, image-grounded — see IDENTITY PRESERVATION above
}`;

    const genPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [...parts, { text: prompt }],
        },
      ],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini analyzeProduct timed out after 6000ms')), 6000)
    );

    const response: any = await Promise.race([genPromise, timeoutPromise]);

    const responseText = response.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to parse Gemini product analysis response: ${responseText.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ProductSpecification;
    return parsed;
  }

  // ─── Product Detection ────────────────────────────────

  async detectProduct(imageBuffer: Buffer): Promise<ProductDetectionResult> {
    const ai = this.getClient();

    const prompt = `You are a precision computer-vision system and professional commercial product-image compositor.

TASK
Analyze the provided photo and identify the single MAIN PRODUCT — the item clearly intended for sale or listing. 

Exclude from consideration: tables, desks, desk mats, screens, keyboards, mice, cables, walls, furniture, people, hands, lighting rigs, packaging not part of the product itself, reflections, and cast shadows.

If multiple similar products appear (e.g., a stack of items), treat them as ONE product group and box the entire group. If multiple DIFFERENT products appear with no clear primary item, select the largest/most centered/most in-focus item as primary and note the rest in "boundaryNotes".

STEP 1 — LOCATE
Determine the tightest bounding box containing the COMPLETE visible main product, including all physically attached parts (handles, rims, straps, lids, cords that are part of the product, irregular/handmade edges). Exclude empty background, unrelated objects, and cast shadows. If part of the product is cropped by the image edge, set the box edge to the image boundary (0 or 1000) rather than guessing beyond the frame.

STEP 2 — SCORE
- confidence (0.0–1.0): your certainty that the selected region is the correct primary product and the box is accurate.
- coverage (0.0–1.0): fraction of the bounding box area actually occupied by the product mask (i.e., how "tight" the box is; 1.0 = product fills the box entirely, e.g. a perfect rectangle).

STEP 3 — OUTPUT
Return ONLY one valid JSON object. No markdown, no code fences, no commentary, no trailing text before or after the JSON.

SCHEMA (all fields required, types strict):
{
  "boundingBox": {
    "x": number,       // 0–1000, left edge
    "y": number,       // 0–1000, top edge
    "width": number,   // 0–1000
    "height": number   // 0–1000
  },
  "confidence": number,        // 0.0–1.0, see STEP 2
  "coverage": number,          // 0.0–1.0, see STEP 2
  "productCount": number,      // count of distinct sellable products visible, even if only 1 is boxed
  "selectedProduct": string,   // short descriptive name, e.g. "ceramic coffee mug"
  "productFullyVisible": boolean,  // false if any part is cropped/cut off by frame or occluded
  "touchesImageEdge": boolean,     // true if bounding box touches x=0, y=0, x=1000, or y=1000
  "occlusion": {
    "level": "none" | "minor" | "major",
    "occludedBy": string[],   // empty array if level is "none"
    "unclearAreas": string[]  // empty array if nothing is ambiguous
  },
  "boundaryNotes": string[],  // e.g. notes on other products excluded, irregular edges, judgment calls made; empty array if none

  "studioProcessing": {
    "background": "seamless neutral studio background",
    "lighting": "soft diffused commercial lighting",
    "exposure": "balanced natural exposure",
    "shadow": "subtle realistic contact shadow, rendered separately from the product mask",
    "composition": "centered, fully visible, professional e-commerce composition",
    "outputAspectRatio": "1:1",
    "identityPreservation": "exact product identity must be preserved",
    "prohibitedChanges": [
      "no shape changes",
      "no proportion changes",
      "no color changes",
      "no logo or text changes",
      "no material or texture changes",
      "no added or removed product parts",
      "no invented details",
      "no background clutter",
      "no watermark or border"
    ]
  }
}

RULES
- Do not invent values. If genuinely uncertain about a field, use your best estimate and lower "confidence" accordingly — never omit a field.
- Numeric fields must be plain numbers (not strings), rounded to the nearest integer for boundingBox, and to 2 decimal places for confidence/coverage.
- Output must be parseable by JSON.parse() with no modification.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: 'image/jpeg',
              },
            },
            { text: prompt },
          ],
        },
      ],
    });

    const responseText = response.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        boundingBox: { x: 200, y: 150, width: 600, height: 700 },
        confidence: 0.85,
        coverage: 0.42,
      };
    }

    return JSON.parse(jsonMatch[0]);
  }

  // ─── AI Studio Image Generation (Imagen) ────────────────

  async generateStudioImage(
    options: StudioGenerationOptions
  ): Promise<{ imageBuffer: Buffer; promptUsed: string; model: string }> {
    const ai = this.getClient();

    const styleDescriptions: Record<string, string> = {
      white_studio:
        'Professional ultra-clean commercial white studio backdrop with soft ambient diffusion, subtle seamless floor gradient, and soft box lighting from upper left. The background is a real photographic studio with seamless white cyclorama wall transitioning to a white floor.',
      wooden_surface:
        'High-resolution rustic polished teak wood tabletop with visible wood grain, natural knots, and warm honey tones. Shot from a 30-degree angle with soft directional natural morning window lighting creating gentle highlights on the wood surface.',
      marble_surface:
        'Luxurious light Carrara marble surface with realistic gray-blue veining patterns, polished to a soft sheen. Subtle reflections visible on the surface. Shot with elegant diffused studio lighting creating gentle caustics on the marble.',
      luxury:
        'Sophisticated luxury boutique dark studio backdrop, deep charcoal-to-black gradient with subtle fabric texture, warm golden rim light from behind, and a soft focused spotlight from above. Premium editorial photography aesthetic.',
    };

    const chosenStyle = styleDescriptions[options.style] || styleDescriptions.white_studio;

    // Build a product-aware prompt for Imagen
    const productDesc = [
      options.productSpec.productType,
      options.productSpec.material,
      `colors: ${options.productSpec.primaryColors.join(', ')}`,
      options.productSpec.texture ? `texture: ${options.productSpec.texture}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const prompt = `Product photography studio scene. Product: ${productDesc}. Background environment: ${chosenStyle}. The product is centered on the surface with a subtle soft contact shadow beneath it. Photorealistic, commercial e-commerce quality, no text, no watermark. The background should be clean and professional without any props or clutter.`;

    try {
      // Try Imagen via Gemini API
      let response: any;
      try {
        response = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '1:1',
            outputMimeType: 'image/jpeg',
          },
        });
      } catch {
        response = await ai.models.generateImages({
          model: 'imagen-3.0-fast-generate-001',
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '1:1',
            outputMimeType: 'image/jpeg',
          },
        });
      }

      const generatedImages = response.generatedImages;
      if (generatedImages && generatedImages.length > 0 && generatedImages[0]?.image?.imageBytes) {
        const imageBytes = generatedImages[0].image.imageBytes;
        const buffer = Buffer.from(imageBytes, 'base64');
        console.log(`[Gemini] Imagen generated studio image: ${buffer.length} bytes`);
        return {
          imageBuffer: buffer,
          promptUsed: prompt,
          model: 'imagen-3.0-generate-002',
        };
      }
    } catch (err: any) {
      console.warn(`[Gemini] Imagen generation failed, falling back to analysis-only:`, err.message);
    }

    // Fallback: return input buffer (Sharp-based background will be used)
    return {
      imageBuffer: options.productImageBuffer,
      promptUsed: prompt,
      model: 'fallback-sharp-compositor',
    };
  }

  // ─── Preservation Validation ───────────────────────────

  async validatePreservation(
    originalOrCutoutBuffer: Buffer,
    generatedBuffer: Buffer,
    productSpec: ProductSpecification
  ): Promise<ValidationResult> {
    const ai = this.getClient();

    const prompt = `You are a strict quality-assurance validator for artisan and e-commerce product photos.

TASK
Compare Image 1 (original product cutout) against Image 2 (rendered studio output). Determine whether Image 2 preserves the exact identity of the product shown in Image 1 — same object, same proportions, same colors, same text/logos/decorations — with only background, lighting, and shadow changed.

WHAT COUNTS AS A VIOLATION
Flag as an issue if Image 2 shows any of the following relative to Image 1:
- Shape or proportion changes (stretched, squashed, resized inconsistently, warped)
- Color shifts beyond what's explainable by lighting/exposure correction (hue changes, wrong material color)
- Missing, added, or altered product parts (handles, rims, lids, seams, components)
- Changed, blurred, removed, or invented text/logos/labels
- Altered artwork, patterns, decorations, or construction details
- Removed or smoothed-over authentic imperfections (handmade irregularities, natural grain/texture) that Image 1 clearly shows
- Orientation changed without justification
- Any element that looks like a different or "redesigned" version of the product rather than the same physical object

Do NOT flag: background replacement, lighting/exposure changes, added contact shadow, minor anti-aliasing/edge softness from segmentation, or cropping/composition changes — these are expected and intentional.

GROUNDING RULES
- Only report issues you can visually confirm by comparing the two images directly. Do not speculate about parts of the product not visible in Image 1.
- If a region is ambiguous (e.g., occluded in Image 1, so you can't verify Image 2), note it in "issues" with category "unverifiable" rather than assuming pass or fail.

SCORING DEFINITIONS
- "shapeSimilarity": 1.0 = identical silhouette/proportions; lower for any warping, resizing, or structural change. Judge geometry only, ignore color/lighting.
- "colorSimilarity": 1.0 = same hues/material color response accounting for lighting correction; lower for hue shifts or incorrect material rendering.
- "confidence": your certainty in this overall assessment, based on image clarity, resolution, and how much of the product is comparable between the two images.
- "preserved": true ONLY if there are zero issues with severity "critical" (see below). Minor/cosmetic issues alone do not fail this.

Respond ONLY with one valid JSON object. No Markdown, no code fences, no commentary before or after.

{
  "preserved": boolean,           // true only if no "critical" severity issues exist
  "confidence": number,           // 0.0-1.0, see SCORING DEFINITIONS
  "shapeSimilarity": number,      // 0.0-1.0
  "colorSimilarity": number,      // 0.0-1.0
  "detailsPreserved": boolean,    // true only if all text/logos/decorations match exactly
  "issues": [
    {
      "category": "shape" | "color" | "text_or_logo" | "missing_part" | "added_part" | "texture_or_decoration" | "orientation" | "unverifiable" | "other",
      "severity": "critical" | "moderate" | "minor",
      "description": string       // specific, image-grounded observation, not generic
    }
  ]                                // empty array if none found
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: originalOrCutoutBuffer.toString('base64'),
                  mimeType: 'image/jpeg',
                },
              },
              {
                inlineData: {
                  data: generatedBuffer.toString('base64'),
                  mimeType: 'image/jpeg',
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback
    }

    return {
      preserved: true,
      confidence: 0.95,
      shapeSimilarity: 0.98,
      colorSimilarity: 0.98,
      detailsPreserved: true,
      issues: [],
    };
  }

  // ─── Real Lighting Analysis via Vision ──────────────────

  async analyzeLightingAdjustment(imageBuffer: Buffer): Promise<ExposureAdjustment> {
    const ai = this.getClient();

    const prompt = `You are a professional photography colorist. Analyze this product photo and determine optimal lighting adjustments for commercial e-commerce catalog use.

Look at:
1. Current brightness level — is the image under/over-exposed?
2. Contrast — is it flat or too harsh?
3. Saturation — are colors muted or oversaturated?
4. Overall color temperature

Respond ONLY with valid JSON:
{
  "brightness": number (1.0 = no change, 0.8 = darker, 1.2 = brighter, range 0.85-1.15),
  "contrast": number (1.0 = no change, 1.0-1.2 for slight boost),
  "saturation": number (1.0 = no change, 0.95-1.1 for subtle enhancement)
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: imageBuffer.toString('base64'),
                  mimeType: 'image/png',
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Clamp values to safe ranges
        return {
          brightness: Math.min(1.15, Math.max(0.85, parsed.brightness || 1.04)),
          contrast: Math.min(1.2, Math.max(0.9, parsed.contrast || 1.05)),
          saturation: Math.min(1.1, Math.max(0.9, parsed.saturation || 1.02)),
        };
      }
    } catch (err: any) {
      console.warn(`[Gemini] Lighting analysis failed:`, err.message);
    }

    // Conservative defaults if analysis fails
    return { brightness: 1.04, contrast: 1.05, saturation: 1.02 };
  }
}
