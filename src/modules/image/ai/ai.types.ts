export interface ProductSpecification {
  productType: string;
  material: string;
  primaryColors: string[];
  secondaryColors: string[];
  shape: string;
  approximateDimensions?: string;
  texture: string;
  craftsmanship: string;
  structuralFeatures: string[];
  visibleDecorations: string[];
  handles?: string;
  edges?: string;
  symmetry?: string;
  orientation?: string;
  preservationRules: string[];
}

export interface ProductDetectionResult {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  coverage?: number;
}

export type StudioStyle =
  | 'white_studio'
  | 'beige_studio'
  | 'wooden_surface'
  | 'marble_surface'
  | 'minimal_premium'
  | 'rustic'
  | 'luxury'
  | 'marketplace_white';

export interface StudioGenerationOptions {
  productImageBuffer: Buffer;
  productSpec: ProductSpecification;
  style: StudioStyle | string;
  aspectRatio?: '1:1' | '4:5' | '16:9';
  strictness?: 'normal' | 'strict' | 'maximum';
}

export interface ValidationResult {
  preserved: boolean;
  confidence: number;
  shapeSimilarity?: number;
  colorSimilarity?: number;
  detailsPreserved?: boolean;
  issues: string[];
}

export interface ExposureAdjustment {
  brightness: number; // e.g. 1.0 - 1.2
  contrast: number;   // e.g. 1.0 - 1.2
  saturation: number; // e.g. 1.0 - 1.2
}

export interface ImageAIProvider {
  name: string;

  analyzeProduct(
    imageBuffers: Buffer[],
    batchContext?: string
  ): Promise<ProductSpecification>;

  detectProduct(
    imageBuffer: Buffer
  ): Promise<ProductDetectionResult>;

  generateStudioImage(
    options: StudioGenerationOptions
  ): Promise<{ imageBuffer: Buffer; promptUsed: string; model: string }>;

  validatePreservation(
    originalOrCutoutBuffer: Buffer,
    generatedBuffer: Buffer,
    productSpec: ProductSpecification
  ): Promise<ValidationResult>;

  analyzeLightingAdjustment?(
    imageBuffer: Buffer
  ): Promise<ExposureAdjustment>;
}
