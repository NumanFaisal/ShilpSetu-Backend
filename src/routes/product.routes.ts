import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Every route here requires a signed-in User (and an Artisan profile).
router.use(authenticate);

// POST /api/products — create a new draft product
router.post('/products', productController.create);

// GET /api/products — list all of my products
router.get('/products', productController.listMine);

// GET /api/products/:id — get one of my products (with images/catalogue/pricing/listings)
router.get('/products/:id', productController.getOne);

// PATCH /api/products/:id — edit fields; set status: "published" to go live on my storefront
router.patch('/products/:id', productController.update);

// DELETE /api/products/:id — archive (soft delete)
router.delete('/products/:id', productController.archive);

export default router;
