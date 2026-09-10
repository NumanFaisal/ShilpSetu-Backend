import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use('/orders', authenticate);

// GET /api/orders — every order against my products
router.get('/orders', orderController.listMine);

// GET /api/orders/:id
router.get('/orders/:id', orderController.getOne);

// PATCH /api/orders/:id/status — move an order through PENDING → CONFIRMED → SHIPPED → DELIVERED
router.patch('/orders/:id/status', orderController.updateStatus);

export default router;
