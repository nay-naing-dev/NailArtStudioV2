import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/tryon.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';
import { createTryOnBody, idParams } from '../validators/schemas.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest('Only image files are allowed')),
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'mask', maxCount: 1 },
]);

// Counted per user, not per IP: they are logged in, and many people share an IP (offices, mobile carriers).
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.tryon.ratePerHour,
  keyGenerator: (req) => String(req.user?._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'You have used all your AI try-ons for this hour. Please try again later.' } },
});

router.get('/config', ctrl.tryOnConfig);
router.post('/', requireAuth, limiter, upload, validate({ body: createTryOnBody }), asyncHandler(ctrl.createTryOn));
router.get('/:id', requireAuth, validate({ params: idParams }), asyncHandler(ctrl.getTryOn));

export default router;
