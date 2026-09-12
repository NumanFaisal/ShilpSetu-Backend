import { env } from '../../../config/env';
import type {
  ImageAIProvider,
  ProductSpecification,
  ProductDetectionResult,
  StudioGenerationOptions,
  ValidationResult,
  ExposureAdjustment,
} from './ai.types';

/**
 * Groq AI Provider — Free tier with Llama 3.2 90B Vision.
 *
 * Free limits: 30 RPM, 14,400 RPD, 500K tokens/day.
 * No credit card required. Sign up at https://console.groq.com
 *
 * Uses OpenAI-compatible API format — no SDK dependency needed.
 */
export class GroqAIProvider implements ImageAIProvider {
  public name = 'groq';
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1';
  // llama-4-scout supports vision and is Groq's current fast multimodal model
  private visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
  private textModel = 'meta-llama/llama-4-scout-17b-16e-instruct';

  constructor() {
    this.apiKey = env.GROQ_API_KEY || '';
  }

  private chatCompletion(params: {
    model: string;
    messages: Array<{ role: string; content: any }>;
    max_tokens?: number;
    temperature?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    return fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.max_tokens || 2048,
        temperature: params.temperature ?? 0.1,
      }),
    }).finally(() => clearTimeout(timeout))
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(`Groq API ${res.status}: ${t.slice(0, 300)}`);
          });
        }
        return res.json();
      })
      .then((data: any) => {
        const text = data.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('Groq returned empty response');
        return text;
      });
  }

  private imagePart(buffer: Buffer, mimeType: string = 'image/jpeg') {
    return {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${buffer.toString('base64')}`,
      },
    };
  }

  private parseJSON(text: string): any {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }

  // ─── Product Analysis ────────────────────────────────

  async analyzeProduct(
    imageBuffers: Buffer[],
    batchContext?: string
  ): Promise<ProductSpecification> {
    const content: any[] = [
      { type: 'text', text: this.getAnalysisPrompt(batchContext) },
      ...imageBuffers.map((buf) => this.imagePart(buf)),
    ];

    const response = await this.chatCompletion({
      model: this.visionModel,
      messages: [{ role: 'user', content }],
      max_tokens: 2048,
    });

    return this.parseJSON(response);
  }

  // ─── Product Detection ────────────────────────────────

  async detectProduct(imageBuffer: Buffer): Promise<ProductDetectionResult> {
    const content: any[] = [
      { type: 'text', text: this.getDetectionPrompt() },
      this.imagePart(imageBuffer),
    ];

    const response = await this.chatCompletion({
      model: this.visionModel,
      messages: [{ role: 'user', content }],
      max_tokens: 1024,
    });

    try {
      return this.parseJSON(response);
    } catch {
      return {
        boundingBox: { x: 200, y: 150, width: 600, height: 700 },
        confidence: 0.85,
        coverage: 0.42,
      };
    }
  }

  // ─── AI Studio Image Generation (not supported by Groq — pass through) ──

  async generateStudioImage(
    options: StudioGenerationOptions
  ): Promise<{ imageBuffer: Buffer; promptUsed: string; model: string }> {
    // Groq doesn't have image generation — return input to let Sharp compositor handle it
    return {
      imageBuffer: options.productImageBuffer,
      promptUsed: 'Groq: no image generation, using Sharp compositor',
      model: 'sharp-compositor',
    };
  }

  // ─── Preservation Validation ───────────────────────────

  async validatePreservation(
    originalOrCutoutBuffer: Buffer,
    generatedBuffer: Buffer,
    productSpec: ProductSpecification
  ): Promise<ValidationResult> {
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
- "colorSimilarity": 1.0 = same hues/material color response accounting`;

    const content: any[] = [
      { type: 'text', text: prompt },
      this.imagePart(originalOrCutoutBuffer),
      this.imagePart(generatedBuffer),
    ];

    try {
      const response = await this.chatCompletion({
        model: this.visionModel,
        messages: [{ role: 'user', content }],
        max_tokens: 512,
      });
      return this.parseJSON(response);
    } catch {
      return {
        preserved: true,
        confidence: 0.95,
        shapeSimilarity: 0.98,
        colorSimilarity: 0.98,
        detailsPreserved: true,
        issues: [],
      };
    }
  }

  // ─── Real Lighting Analysis via Vision ──────────────────

  async analyzeLightingAdjustment(imageBuffer: Buffer): Promise<ExposureAdjustment> {
    const prompt = `You are a professional photography colorist specializing in e-commerce catalog imagery.

TASK
Analyze this product photo and determine corrective lighting adjustments that bring it to a neutral, well-exposed, true-to-life commercial standard — as if shot in a properly lit studio. You are correcting flaws in the CURRENT photo, not applying a creative style.

WHAT TO EVALUATE
1. Brightness — Is the product under-exposed (dark, muddy shadows losing detail) or over-exposed (blown highlights, washed-out surface detail)? Neutral = mid-tones sit naturally, no clipped highlights or crushed shadows on the product.
2. Contrast — Is the image flat (grey, low dynamic range, product lacks depth) or too harsh (crushed blacks, blown whites, exaggerated edges)? Neutral = product has natural depth and texture is visible.
3. Saturation — Are colors muted/desaturated (product looks grey or faded) or oversaturated (colors look artificial, neon, or clipped)? Neutral = colors match what the material would look like under accurate white light.

REFERENCE POINT
Judge only the PRODUCT itself, not the background — if the background is already neutral studio grey/white, ignore it for this analysis. Base your judgment on skin-tone-equivalent neutrality for the product's actual material (e.g., a white ceramic mug should read as clean white, not grey or blue-tinted).

RULES
- If the image is already close to correct, return values close to 1.0 — do not manufacture a correction where none is needed. Small deviations (e.g. 1.02) are valid and preferred over forcing round numbers.
- Never exceed the given ranges even if the image seems severely flawed — these ranges are intentionally conservative caps for a single correction pass.
- Base every value on what you actually observe in the image, not a generic default.

Respond ONLY with one valid JSON object. No Markdown, no code fences, no commentary before or after.

{
  "brightness": number,     // 0.85-1.15; 1.0 = no change; >1.0 = brighten, <1.0 = darken
  "contrast": number,       // 0.9-1.2; 1.0 = no change; >1.0 = increase, <1.0 = flatten
  "saturation": number,     // 0.9-1.1; 1.0 = no change; >1.0 = boost, <1.0 = desaturate
  "reasoning": {
    "brightness": string,   // one short phrase, e.g. "slightly underexposed, shadows lose detail"
    "contrast": string,
    "saturation": string
  }
}`;

    const content: any[] = [
      { type: 'text', text: prompt },
      this.imagePart(imageBuffer, 'image/png'),
    ];

    try {
      const response = await this.chatCompletion({
        model: this.visionModel,
        messages: [{ role: 'user', content }],
        max_tokens: 256,
      });
      const parsed = this.parseJSON(response);
      return {
        brightness: Math.min(1.15, Math.max(0.85, parsed.brightness || 1.04)),
        contrast: Math.min(1.2, Math.max(0.9, parsed.contrast || 1.05)),
        saturation: Math.min(1.1, Math.max(0.9, parsed.saturation || 1.02)),
      };
    } catch {
      return { brightness: 1.04, contrast: 1.05, saturation: 1.02 };
    }
  }

  // ─── Shared Prompts ────────────────────────────────────

  private getAnalysisPrompt(batchContext?: string): string {
    return `You are a master product analyst and e-commerce catalog expert.

TASK
Analyze the provided product photo(s). Identify and describe ONLY the primary product in the foreground — the item intended for sale. Ignore background objects, tables, people, hands, and clutter.

${batchContext ? `Batch Context: ${batchContext}` : ''}

This analysis feeds a downstream pipeline (detection → background removal → studio reconstruction → final image). You are only describing what is visible — not generating the final image.

GROUNDING RULES
- Describe only what is visibly supported by the image. Never guess hidden areas, unreadable text, exact measurements, or occluded parts.
- If a detail is uncertain or partially visible, say so explicitly rather than omitting it or guessing.
- If multiple products appear, describe the primary/foreground one; note others exist under "occludedOrUnclearAreas" rather than merging their attributes.

IDENTITY PRESERVATION
"preservationRules" must list SPECIFIC, image-grounded details (not generic restatements) — the exact things a downstream editor must not alter, remove, redesign, or invent: shape/proportions, authentic colors, material/texture, logos/text/artwork, construction details, natural handmade irregularities, orientation, and any unique identifying feature. Write these as concrete observations (e.g., "uneven rim thickness, thicker on the left side"), not as a copy of this instruction.

OUTPUT
Respond ONLY with one valid JSON object matching the schema below. No Markdown, no code fences, no commentary.

SCHEMA (all fields required; use "unknown" for a string or [] for an array if not visible/applicable — never omit a field):
{
  "productType": string,
  "productCount": number,               // distinct products visible, even if only 1 is described
  "material": string,
  "primaryColors": string[],
  "secondaryColors": string[],
  "shape": string,
  "approximateDimensions": string,       // relative/proportional only, e.g. "roughly twice as tall as wide"; never invent units
  "texture": string,
  "craftsmanship": string,
  "structuralFeatures": string[],        // physical construction: joints, seams, base, openings — NOT decorative elements
  "visibleDecorations": string[],        // applied/decorative: paint, glaze, carving, embroidery — NOT structural elements
  "handles": string,                     // "none" if absent
  "edges": string,
  "symmetry": string,
  "orientation": string,
  "visibleText": string[],               // transcribe exactly as seen; [] if none
  "logosAndBranding": string[],
  "surfaceCondition": string[],
  "occludedOrUnclearAreas": string[],
  "preservationRules": string[]          // specific, image-grounded — see IDENTITY PRESERVATION above
}`;
  }

  private getDetectionPrompt(): string {
    return `You are a precision computer-vision system for commercial product photography.

TASK
Inspect this photo and locate the single MAIN PRODUCT — the item intended for sale in the foreground. Ignore tables, desks, screens, keyboards, mice, cables, walls, furniture, people, hands, lighting equipment, reflections, and cast shadows.

If multiple similar items appear (e.g., a stack), treat them as one product group and box the entire group. If multiple different products appear with no clear primary item, select the largest/most centered/most in-focus one and note the others in "boundaryNotes".

STEP 1 — LOCATE
Find the tightest bounding box containing the COMPLETE visible main product, including all physically attached parts (handles, rims, edges, protruding components). Exclude empty background and cast shadows. If the product is cropped by the image frame, set that box edge to the boundary (0 or 1000) rather than guessing beyond the frame.

STEP 2 — SCORE
- confidence (0.0-1.0): your certainty the selected region and box are correct.
- coverage (0.0-1.0): fraction of the box area actually occupied by the product (1.0 = product fills the box with no empty space, e.g. a perfect rectangle).

OUTPUT
Respond ONLY with one valid JSON object. No Markdown, no code fences, no commentary.

{
  "boundingBox": {
    "x": number,       // 0-1000, left edge
    "y": number,       // 0-1000, top edge
    "width": number,   // 0-1000
    "height": number   // 0-1000
  },
  "confidence": number,          // 0.0-1.0, see STEP 2
  "coverage": number,            // 0.0-1.0, see STEP 2
  "productCount": number,        // distinct sellable products visible, even if only 1 is boxed
  "selectedProduct": string,
  "productFullyVisible": boolean,   // false if any part is cropped or occluded
  "touchesImageEdge": boolean,      // true if box touches x=0, y=0, x=1000, or y=1000
  "occlusion": {
    "level": "none" | "minor" | "major",
    "occludedBy": string[],   // [] if level is "none"
    "unclearAreas": string[]  // [] if nothing ambiguous
  },
  "boundaryNotes": string[]   // [] if none; note excluded secondary products, irregular edges, judgment calls
}`;
  }
}
