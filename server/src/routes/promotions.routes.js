import { Router } from 'express';
import * as ctrl from '../controllers/promotions.controller.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createPromotionBody, idParams, updatePromotionBody } from '../validators/schemas.js';

// Admin only. Customers reach promotions through POST /appointments/quote.
const router = Router();
router.use(requireAdmin);

router.get('/', asyncHandler(ctrl.listPromotions));
router.post('/', validate({ body: createPromotionBody }), asyncHandler(ctrl.createPromotion));
router.patch('/:id', validate({ params: idParams, body: updatePromotionBody }), asyncHandler(ctrl.updatePromotion));
router.delete('/:id', validate({ params: idParams }), asyncHandler(ctrl.deletePromotion));

export default router;
