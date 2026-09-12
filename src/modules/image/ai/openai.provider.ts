import OpenAI from 'openai';
import { env } from '../../../config/env';
import type {
  ImageAIProvider,
  ProductSpecification,
  ProductDetectionResult,
  StudioGenerationOptions,
  ValidationResult,
  ExposureAdjustment,
} from './ai.types';

export class OpenAIAIProvider implements ImageAIProvider {
  public name = 'openai';
  private openai: OpenAI | null = null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
  }

  private getClient(): OpenAI {
    if (!this.openai) {
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async analyzeProduct(
    imageBuffers: Buffer[],
    batchContext?: string
  ): Promise<ProductSpecification> {
    const openai = this.getClient();

    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = imageBuffers.map(
      (buf) => ({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${buf.toString('base64')}`,
          detail: 'high',
        },
      })
    );

    const prompt = `You are a master product analyst, artisan-craft specialist, commercial product photographer, and e-commerce catalog expert.

TASK
Analyze the provided artisan product photo(s). Identify and describe ONLY the primary product object in the foreground — the item intended for sale. Ignore all unrelated background elements: tables, desks, desk mats, monitors, keyboards, mice, cables, walls, furniture, people, hands, lighting equipment, reflections, and cast shadows.

${batchContext ? `Batch Context: ${batchContext}` : ''}

This analysis feeds a downstream pipeline: product identification → detection → background removal → cleanup → AI studio reconstruction → lighting/exposure correction → shadow generation → final e-commerce image. Your job is ONLY to describe what is visibly true — you are not generating the final image.

GROUNDING RULES
- Describe only what is visibly supported by the image. Never guess hidden areas, unreadable text, exact measurements, or occluded parts.
- If a detail is uncertain or partially visible, say so explicitly (e.g., "partially visible, likely ceramic — occluded by shadow") rather than omitting it or guessing.
- If multiple products appear, describe the primary/foreground one and note the others exist in "occludedOrUnclearAreas" or a dedicated note — do not merge their attributes.

IDENTITY PRESERVATION
Everything you list under "preservationRules" must be a SPECIFIC, image-grounded detail (not generic boilerplate) — the exact things a downstream editor must not alter, remove, redesign, translate, or invent, including: shape/proportions, authentic colors, material/texture, logos/text/symbols, artwork/patterns/seams/handles/rims/construction details, natural handmade irregularities (fibers, grain, dents, authentic imperfections), orientation, and any unique identifying feature. Write these as concrete observations (e.g., "asymmetric rim with three visible thumb-press indentations"), not as a restatement of this rule.

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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageContent],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content) as ProductSpecification;
  }

  async detectProduct(imageBuffer: Buffer): Promise<ProductDetectionResult> {
    const openai = this.getClient();

    const prompt = `You are a precision computer-vision system for commercial product photography.

TASK
Inspect this photo and locate the single MAIN PRODUCT — the item intended for sale in the foreground. Ignore tables, desks, desk mats, screens, keyboards, mice, cables, walls, furniture, people, hands, lighting equipment, reflections, and cast shadows.

If multiple similar items appear (e.g., a stack), treat them as one product group and box the entire group. If multiple different products appear with no clear primary item, select the largest/most centered/most in-focus one and note the others in "boundaryNotes".

STEP 1 — LOCATE
Find the tightest bounding box containing the COMPLETE visible main product, including all physically attached parts (handles, rims, edges, protruding components, irregular handmade boundaries). Exclude empty background and cast shadows. If the product is cropped by the image frame, set that box edge to the boundary (0 or 1000) rather than guessing beyond the frame.

STEP 2 — SCORE
- confidence (0.0-1.0): your certainty the selected region and box are correct.
- coverage (0.0-1.0): fraction of the box area actually occupied by the product (1.0 = product fills the box with no empty space).

OUTPUT
Respond ONLY with one valid JSON object for the detection metadata. No Markdown, no code fences, no commentary.

{
  "boundingBox": { "x": number, "y": number, "width": number, "height": number },
  "confidence": number,
  "coverage": number,
  "productCount": number,
  "selectedProduct": string,
  "productFullyVisible": boolean,
  "touchesImageEdge": boolean,
  "occlusion": { "level": "none" | "minor" | "major", "occludedBy": string[], "unclearAreas": string[] },
  "boundaryNotes": string[]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch {
      return {
        boundingBox: { x: 100, y: 100, width: 800, height: 800 },
        confidence: 0.85,
        coverage: 0.64,
      };
    }
  }

  async generateStudioImage(
    options: StudioGenerationOptions
  ): Promise<{ imageBuffer: Buffer; promptUsed: string; model: string }> {
    const openai = this.getClient();

    const stylePrompt = `High-end commercial e-commerce product photograph of authentic ${options.productSpec.productType} made of ${options.productSpec.material}, in style ${options.style}, soft natural contact shadows, hyper-realistic, 8k commercial studio lighting. CRITICAL: Preserve authentic handcraft details, exact textures, colors ${options.productSpec.primaryColors.join(', ')}.`;

    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: stylePrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });

      const b64 = response.data?.[0]?.b64_json;
      if (b64) {
        return {
          imageBuffer: Buffer.from(b64, 'base64'),
          promptUsed: stylePrompt,
          model: 'dall-e-3',
        };
      }
    } catch (err: any) {
      console.warn('[OpenAIProvider] DALL-E generation fallback:', err.message);
    }

    return {
      imageBuffer: options.productImageBuffer,
      promptUsed: stylePrompt,
      model: 'deterministic-fallback',
    };
  }

  async validatePreservation(
    originalOrCutoutBuffer: Buffer,
    generatedBuffer: Buffer,
    productSpec: ProductSpecification
  ): Promise<ValidationResult> {
    const openai = this.getClient();

    const prompt = `Compare Image 1 (original artisan product) and Image 2 (rendered product).
Product Spec: ${JSON.stringify(productSpec)}

Evaluate if product shape, colors, craftsmanship details, textures and authenticity are preserved without hallucinating alterations.

Respond ONLY with JSON:
{
  "preserved": boolean,
  "confidence": number,
  "shapeSimilarity": number,
  "colorSimilarity": number,
  "detailsPreserved": boolean,
  "issues": ["string"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${originalOrCutoutBuffer.toString('base64')}`,
              },
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${generatedBuffer.toString('base64')}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content);
  }

  async analyzeLightingAdjustment(imageBuffer: Buffer): Promise<ExposureAdjustment> {
    return { brightness: 1.04, contrast: 1.07, saturation: 1.02 };
  }
}
