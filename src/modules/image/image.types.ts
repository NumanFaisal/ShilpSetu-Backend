import { z } from 'zod';

export const STUDIO_STYLES = [
  'white_studio',
  'wooden_surface',
  'marble_surface',
  'luxury',
] as const;

export type StudioStyleValue = (typeof STUDIO_STYLES)[number];

export const createBatchSchema = z.object({
  imageCount: z.coerce
    .number()
    .int()
    .min(1, 'Minimum 1 image is required')
    .max(10, 'Maximum 10 images allowed per batch'),
  productId: z.coerce.number().int().optional(),
  style: z.enum([...STUDIO_STYLES] as [string, ...string[]]).default('white_studio'),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export interface UploadSessionImage {
  imageId: string;
  uploadUrl: string;
  objectKey: string;
}

export interface CreateBatchResponse {
  batchId: string;
  images: UploadSessionImage[];
}

export interface ImageDetailResponse {
  imageId: string;
  status: string;
  currentStep: string;
  progress: number;
  error?: string | null;
  analysis?: any;
  boundingBox?: any;
  validationScore?: number | null;
  outputs?: {
    square?: string;
    portrait?: string;
    landscape?: string;
  };
  versions?: Array<{
    step: string;
    storageKey: string;
    format?: string | null;
    url?: string;
  }>;
}

export interface BatchDetailResponse {
  batchId: string;
  status: string;
  totalImages: number;
  completedImages: number;
  failedImages: number;
  createdAt: string;
  updatedAt: string;
  images: ImageDetailResponse[];
}
