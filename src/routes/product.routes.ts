import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../prisma/db';
import { authenticate } from '../middleware/auth.middleware';
import { HttpError } from '../lib/http-error';

const router = Router();

// ─── GET /api/products — list products (public or filtered) ───────────────────
router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, search, artisanId, status, limit = '50', offset = '0' } = req.query;

    const where: Record<string, any> = {};
    if (category && category !== 'all') {
      where.category = String(category);
    }
    if (artisanId) {
      where.artisanId = Number(artisanId);
    }
    if (status) {
      where.status = String(status);
    }

    let products = await db.orm.public.Product.where(where).all();

    // In-memory filter for search query across name & description
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.material && p.material.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    }

    // Attach related images, catalogue, and artisan if available
    const enriched = await Promise.all(
      products.map(async (p) => {
        const catalogue = await db.orm.public.Catalogue.where({ productId: p.id }).first();
        const pricing = await db.orm.public.Pricing.where({ productId: p.id }).first();
        const artisan = await db.orm.public.Artisan.where({ id: p.artisanId }).first();

        // Sample / fallback images if none in DB
        const defaultImages = [
          {
            id: `img-${p.id}-1`,
            url:
              p.category === 'pottery'
                ? 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800'
                : p.category === 'textiles'
                ? 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800'
                : p.category === 'metalcraft'
                ? 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800'
                : 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          },
        ];

        return {
          id: p.id,
          artisanId: p.artisanId,
          name: p.name,
          category: p.category || 'Handicrafts',
          material: p.material || '',
          description: p.description || '',
          price: p.price ?? 1200,
          quantity: p.quantity,
          status: p.status,
          images: defaultImages,
          catalog: catalogue || undefined,
          pricing: pricing || undefined,
          artisan: artisan
            ? {
                id: artisan.id,
                name: artisan.storeName || 'Artisan',
                location: artisan.location,
                craftType: artisan.craftType,
              }
            : undefined,
          createdAt: p.createdAt,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/products/:id — single product detail ────────────────────────────
router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const product = await db.orm.public.Product.where({ id }).first();
    if (!product) throw new HttpError(404, 'Product not found');

    const catalogue = await db.orm.public.Catalogue.where({ productId: id }).first();
    const pricing = await db.orm.public.Pricing.where({ productId: id }).first();
    const artisan = await db.orm.public.Artisan.where({ id: product.artisanId }).first();

    res.json({
      id: product.id,
      artisanId: product.artisanId,
      name: product.name,
      category: product.category,
      material: product.material,
      description: product.description,
      price: product.price ?? 1200,
      quantity: product.quantity,
      status: product.status,
      images: [
        {
          id: `img-${product.id}`,
          url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800',
        },
      ],
      catalog: catalogue || undefined,
      pricing: pricing || undefined,
      artisan: artisan
        ? {
            id: artisan.id,
            name: artisan.storeName || 'Master Artisan',
            location: artisan.location,
            craftType: artisan.craftType,
          }
        : undefined,
      createdAt: product.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/products — create product ──────────────────────────────────────
router.post('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      category,
      material,
      description,
      price,
      quantity = 1,
      status = 'active',
      artisanId,
    } = req.body;

    if (!name) throw new HttpError(400, 'Product name is required');

    // Find or fallback artisan
    let targetArtisanId = artisanId ? Number(artisanId) : 1;
    let artisan = await db.orm.public.Artisan.where({ id: targetArtisanId }).first();
    if (!artisan) {
      // Find first artisan in DB or create fallback
      artisan = await db.orm.public.Artisan.all().first();
      if (!artisan) {
        let user = await db.orm.public.User.all().first();
        if (!user) {
          user = await db.orm.public.User.create({
            name: 'Master Artisan',
            phone: '+919876543210',
            passwordHash: '',
            role: 'artisan',
            language: 'en',
          });
        }
        artisan = await db.orm.public.Artisan.create({
          userId: user.id,
          craftType: category || 'Pottery',
          location: 'Jaipur, Rajasthan',
          state: 'Rajasthan',
          district: 'Jaipur',
          experience: 8,
          slug: 'master-artisan-' + Date.now(),
          storeName: 'Jaipur Blue Pottery Studio',
        });
      }
      targetArtisanId = artisan.id;
    }

    const created = await db.orm.public.Product.create({
      artisanId: targetArtisanId,
      name,
      category: category || 'Handicrafts',
      material: material || '',
      description: description || '',
      price: price != null ? Number(price) : 1200,
      quantity: Number(quantity) || 1,
      status,
    });

    res.status(201).json({
      id: created.id,
      artisanId: created.artisanId,
      name: created.name,
      category: created.category,
      material: created.material,
      description: created.description,
      price: created.price,
      quantity: created.quantity,
      status: created.status,
      message: 'Product published successfully',
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/products/:id — update product ───────────────────────────────────
router.put('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { name, category, material, description, price, quantity, status } = req.body;

    const updated = await db.orm.public.Product.where({ id }).update({
      ...(name ? { name } : {}),
      ...(category ? { category } : {}),
      ...(material ? { material } : {}),
      ...(description ? { description } : {}),
      ...(price != null ? { price: Number(price) } : {}),
      ...(quantity != null ? { quantity: Number(quantity) } : {}),
      ...(status ? { status } : {}),
    });

    res.json({ message: 'Product updated successfully', product: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
