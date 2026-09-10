import { z } from 'zod';

export const createArtisanSchema = z.object({
  location: z.string().trim().min(1, 'Location is required'),
  state: z.string().trim().min(1, 'State is required'),
  district: z.string().trim().min(1, 'District is required'),
  craftType: z.string().trim().min(1, 'Craft type is required'),
  experience: z.coerce.number().int().min(0).optional(),
  storeName: z.string().trim().min(1).max(120).optional(),
  bio: z.string().trim().max(1000).optional(),
});

export const updateArtisanSchema = createArtisanSchema.partial();

export type CreateArtisanInput = z.infer<typeof createArtisanSchema>;
export type UpdateArtisanInput = z.infer<typeof updateArtisanSchema>;
