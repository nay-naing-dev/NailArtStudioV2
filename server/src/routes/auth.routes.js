import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginBody, registerBody } from '../validators/schemas.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/register', authLimiter, validate({ body: registerBody }), asyncHandler(ctrl.register));
router.post('/login', authLimiter, validate({ body: loginBody }), asyncHandler(ctrl.login));
router.get('/me', requireAuth, asyncHandler(ctrl.me));

export default router;
