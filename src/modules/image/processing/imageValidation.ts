import { aiService } from '../ai/ai.service';
import type { ProductSpecification, ValidationResult } from '../ai/ai.types';

export interface PreservationAuditResult {
  passed: boolean;
  needsReview: boolean;
  confidence: number;
  shapeSimilarity: number;
  colorSimilarity: number;
  issues: string[];
}

/**
 * Validates whether the AI studio generation maintained authentic artisan product integrity.
 */
export async function validateProductPreservation(
  originalOrCutoutBuffer: Buffer,
  generatedStudioBuffer: Buffer,
  productSpec: ProductSpecification,
  options?: { batchId?: string; imageId?: string }
): Promise<PreservationAuditResult> {
  const result: ValidationResult = await aiService.validatePreservation(
    originalOrCutoutBuffer,
    generatedStudioBuffer,
    productSpec,
    options
  );

  const shapeSim = result.shapeSimilarity ?? (result.preserved ? 0.95 : 0.6);
  const colorSim = result.colorSimilarity ?? (result.preserved ? 0.95 : 0.6);
  const confidence = result.confidence ?? 0.9;

  // If confidence is below 0.70 or preserved is false, flag for review
  const passed = result.preserved && confidence >= 0.75 && shapeSim >= 0.75;
  const needsReview = !passed;

  return {
    passed,
    needsReview,
    confidence,
    shapeSimilarity: shapeSim,
    colorSimilarity: colorSim,
    issues: result.issues || [],
  };
}
