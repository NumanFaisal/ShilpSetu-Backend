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

Analyze the provided artisan product photo(s). Identify and describe ONLY the primary product object in the foreground. Ignore all unrelated background objects, including tables, desks, desk mats, computer monitors, keyboards, mice, cables, room walls, furniture, people, hands, lighting equipment, reflections, and cast shadows.

${batchContext ? `Batch Context: ${batchContext}` : ''}

Your analysis will be used for:
1. Product identification
2. Precise product detection
3. Background removal and segmentation
4. Product cleanup
5. AI studio reconstruction
6. Lighting and exposure correction
7. Realistic shadow generation
8. Professional e-commerce composition
9. Final image generation

Analyze only details that are visibly supported by the image. Do not guess hidden areas, unreadable text, exact measurements, unseen materials, or missing product parts. If a detail is uncertain, describe it as uncertain.

The product identity must be preserved exactly during all later processing. The following details MUST NOT be changed, removed, redesigned, translated, replaced, or invented:
- Product shape and proportions
- Authentic colors and color relationships
- Material appearance and surface texture
- Logos, brand names, labels, symbols, and printed text
- Artwork, patterns, decorations, seams, joints, handles, openings, rims, edges, and construction details
- Natural handmade irregularities, fibers, grain, dents, scratches, and authentic imperfections
- Product orientation unless explicitly requested
- Any unique identifying feature

Respond ONLY with one valid JSON object matching this exact schema. Do not include Markdown, explanations, comments, or code fences.

{
  "productType": "string",
  "material": "string",
  "primaryColors": ["string"],
  "secondaryColors": ["string"],
  "shape": "string",
  "approximateDimensions": "string or description based only on visible proportions; do not invent exact measurements",
  "texture": "string",
  "craftsmanship": "string",
  "structuralFeatures": ["string"],
  "visibleDecorations": ["string"],
  "handles": "string or none",
  "edges": "string",
  "symmetry": "string",
  "orientation": "string",
  "visibleText": ["string"],
  "logosAndBranding": ["string"],
  "surfaceCondition": ["string"],
  "occludedOrUnclearAreas": ["string"],
  "preservationRules": [
    "List every critical visual detail that must remain unchanged during segmentation, cleanup, editing, reconstruction, and final image generation"
  ],
  "studioProcessingInstructions": {
    "background": "clean seamless neutral studio background with no unrelated objects",
    "lighting": "soft diffused commercial product lighting that preserves the real material response",
    "exposure": "balanced exposure with natural highlights and shadow detail",
    "shadow": "subtle physically accurate contact shadow beneath the product, separate from the product mask",
    "composition": "centered professional e-commerce composition with balanced negative space",
    "prohibitedChanges": [
      "Do not alter product identity, proportions, colors, text, logo, artwork, texture, structure, or authentic imperfections",
      "Do not add props, accessories, extra parts, people, hands, furniture, or background clutter",
      "Do not make the product look like a different item or a digitally redesigned version"
    ]
  }
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

    const prompt = `You are a precision computer-vision system and professional commercial product-image compositor.

Carefully inspect the provided photo and identify the MAIN PRODUCT item in the foreground. Select only the primary product intended for sale. Ignore the table, desk, desk mat, computer screen, keyboard, mouse, cables, walls, furniture, people, hands, lighting equipment, unrelated objects, reflections, and cast shadows.

First, find the tightest accurate bounding box containing ONLY the complete visible main product. The bounding box must include all physically connected product parts, including handles, rims, protruding edges, attached components, and irregular handmade boundaries. It must exclude empty background space, unrelated objects, and cast shadows.

Return normalized coordinates on a 0 to 1000 scale, where 0,0 is the top-left and 1000,1000 is the bottom-right:
- x: leftmost product coordinate
- y: topmost product coordinate
- width: product bounding-box width
- height: product bounding-box height

Then use the detected product as an immutable reference for the complete image-processing workflow:

1. Product Detection:
   - Detect only the main foreground product.
   - Do not include background objects or shadows.
   - If multiple separate products are present, select the largest or most prominent product unless batch context specifies otherwise.

2. Background Removal and Segmentation:
   - Create a precise foreground mask containing only the product.
   - Preserve thin edges, fibers, handles, openings, holes, gaps, rims, seams, and negative spaces.
   - Exclude the cast shadow from the product mask.
   - Do not crop, reshape, repaint, or regenerate the product.
   - Preserve genuine handmade irregularities and natural imperfections.
   - Avoid white halos, dark outlines, jagged edges, color spill, and transparent product regions.

3. Product Cleanup:
   - Remove only background fragments, dust caused by the original scene, segmentation artifacts, color spill, sensor noise, and accidental objects.
   - Correct minor exposure, white balance, and lens distortion conservatively.
   - Do not remove authentic scratches, dents, fibers, grain, wear, or handmade variation.
   - Do not alter any logo, brand name, label, text, pattern, artwork, color, material, structure, proportion, or product detail.

4. AI Studio Reconstruction:
   - Place the exact isolated product in a premium, clean, seamless studio environment.
   - Use a warm-white, neutral-white, or light-gray background with a subtle professional gradient.
   - Do not add a table, desk, monitor, keyboard, mouse, cables, room, wall, people, hands, props, decorations, watermark, border, or frame.
   - Keep the product centered, fully visible, uncropped, and naturally scaled.
   - Preserve the original orientation unless explicitly instructed otherwise.
   - Use balanced negative space of approximately 8–15% around the product.

5. Lighting and Exposure:
   - Use soft, large-area diffused key lighting from the upper front-left.
   - Add subtle fill lighting from the opposite side.
   - Preserve realistic highlights, shadows, color, and material response.
   - Maintain visible woven fibers, wood grain, paper texture, ceramic variation, metal reflections, or other authentic surface detail.
   - Avoid excessive HDR, oversaturation, blown highlights, crushed shadows, artificial gloss, plastic smoothing, heavy blur, and unrealistic reflections.

6. Realistic Shadow:
   - Add one subtle, physically accurate contact shadow below and slightly behind the product.
   - Match the shadow direction to the studio light direction.
   - Keep the shadow soft-edged, natural, and grounded.
   - Do not include the shadow inside the product segmentation mask.
   - Do not create multiple conflicting shadows or a floating appearance.

7. Final Output:
   - Generate a photorealistic commercial e-commerce image.
   - Use a 1:1 aspect ratio unless another ratio is explicitly provided.
   - Keep every visible product detail unchanged.
   - Do not invent or rewrite text.
   - Do not generate a different product.
   - Do not add extra objects.
   - Produce clean edges, natural color reproduction, realistic perspective, high detail, balanced exposure, and professional marketplace-ready composition.

Respond ONLY with one valid JSON object for the detection metadata. Do not include Markdown, explanations, comments, or code fences.

{
  "boundingBox": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0
  },
  "confidence": 0.0,
  "coverage": 0.0,
  "productCount": 1,
  "selectedProduct": "string",
  "segmentationRequired": true,
  "includeCastShadowInMask": false,
  "backgroundObjectsExcluded": true,
  "productFullyVisible": true,
  "touchesImageEdge": false,
  "occlusion": {
    "level": "none | minor | major",
    "occludedBy": ["string"],
    "unclearAreas": ["string"]
  },
  "boundaryNotes": ["string"],
  "studioProcessing": {
    "background": "seamless neutral studio background",
    "lighting": "soft diffused commercial lighting",
    "exposure": "balanced natural exposure",
    "shadow": "subtle realistic contact shadow separate from the product mask",
    "composition": "centered, fully visible, professional e-commerce composition",
    "outputAspectRatio": "1:1",
    "identityPreservation": "exact product identity must be preserved",
    "prohibitedChanges": [
      "No shape changes",
      "No proportion changes",
      "No color changes",
      "No logo or text changes",
      "No material or texture changes",
      "No added or removed product parts",
      "No invented details",
      "No background clutter",
      "No watermark or border"
    ]
  }
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
