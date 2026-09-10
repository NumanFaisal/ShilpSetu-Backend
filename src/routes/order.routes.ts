import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use('/orders', authenticate);

// POST /api/orders — buyer places an order
router.post('/orders', orderController.create);

// GET /api/orders/buyer — orders placed by the authenticated buyer
router.get('/orders/buyer', orderController.listBuyerOrders);

// GET /api/orders — role-aware list (orders against artisan products OR orders placed by buyer)
router.get('/orders', orderController.listMine);

// GET /api/orders/:id — order details with financial summary and milestones
router.get('/orders/:id', orderController.getOne);

// PATCH /api/orders/:id/status — move an order through PENDING → CONFIRMED → IN_PRODUCTION → SHIPPED → DELIVERED
router.patch('/orders/:id/status', orderController.updateStatus);

export default router;
