import { Router } from 'express';
import * as ctrl from '../controllers/designs.controller.js';
import { optionalAuth, requireAdmin } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createDesignBody,
  idParams,
  listDesignsQuery,
  reprocessBody,
  updateDesignBody,
} from '../validators/schemas.js';

const router = Router();

router.get('/', optionalAuth, validate({ query: listDesignsQuery }), asyncHandler(ctrl.listDesigns));
router.get('/:id', optionalAuth, validate({ params: idParams }), asyncHandler(ctrl.getDesign));

router.post(
  '/',
  requireAdmin,
  imageUpload.single('image'),
  validate({ body: createDesignBody }),
  asyncHandler(ctrl.createDesign),
);
router.patch(
  '/:id',
  requireAdmin,
  imageUpload.single('image'),
  validate({ params: idParams, body: updateDesignBody }),
  asyncHandler(ctrl.updateDesign),
);
router.put(
  '/:id/texture',
  requireAdmin,
  imageUpload.single('image'),
  validate({ params: idParams }),
  asyncHandler(ctrl.updateTexture),
);
router.post(
  '/:id/reprocess',
  requireAdmin,
  validate({ params: idParams, body: reprocessBody }),
  asyncHandler(ctrl.reprocessDesign),
);
router.delete('/:id', requireAdmin, validate({ params: idParams }), asyncHandler(ctrl.archiveDesign));

export default router;
