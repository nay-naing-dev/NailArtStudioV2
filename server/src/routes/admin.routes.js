import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as broadcast from '../controllers/broadcast.controller.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { broadcastBody } from '../validators/schemas.js';

const router = Router();
router.use(requireAdmin);

// Guards against an accidental double send (or a stolen admin token) mailing every customer repeatedly.
const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skipFailedRequests: true, // a misconfigured mail server shouldn't use up the allowance
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.get('/broadcast/audience', asyncHandler(broadcast.broadcastAudience));
router.post('/broadcast', broadcastLimiter, validate({ body: broadcastBody }), asyncHandler(broadcast.sendCustomerBroadcast));

export default router;
