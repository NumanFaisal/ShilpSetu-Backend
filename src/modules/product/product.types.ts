import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional(),
  material: z.string().trim().max(100).optional(),
  craftType: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().int().min(0).default(0),
  stock: z.coerce.number().int().min(0).optional(),
  images: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  dimensions: z.string().optional(),
  weight: z.string().optional(),
  origin: z.string().optional(),
  mrp: z.coerce.number().optional(),
}).refine(data => !!(data.name || data.title), {
  message: 'Product name or title is required',
}).transform(data => ({
  ...data,
  name: (data.name || data.title) as string,
  quantity: data.stock !== undefined ? data.stock : data.quantity,
}));

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional(),
  material: z.string().trim().max(100).optional(),
  craftType: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).transform(data => ({
  ...data,
  name: data.name || data.title,
  quantity: data.stock !== undefined ? data.stock : data.quantity,
}));

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
