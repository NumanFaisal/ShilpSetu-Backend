import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  category: z.string().trim().max(100).optional(),
  material: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().int().min(0).default(0),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional(),
  material: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  // Setting status: 'published' here is what puts the product on YOUR OWN
  // storefront (/api/public/stores/:slug). It's checked server-side to
  // require a completed studio image first. This is separate from
  // POST /api/products/:id/publish (already defined in marketplace.routes.ts),
  // which pushes an already-published product OUT to Amazon/ONDC/GeM/etc.
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
