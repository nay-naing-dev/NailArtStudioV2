import { Router } from 'express';
import * as ctrl from '../controllers/services.controller.js';
import { optionalAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createServiceBody, idParams, listServicesQuery, updateServiceBody } from '../validators/schemas.js';

const router = Router();

router.get('/', optionalAuth, validate({ query: listServicesQuery }), asyncHandler(ctrl.listServices));
router.get('/:id', optionalAuth, validate({ params: idParams }), asyncHandler(ctrl.getService));

router.post('/', requireAdmin, validate({ body: createServiceBody }), asyncHandler(ctrl.createService));
router.patch(
  '/:id',
  requireAdmin,
  validate({ params: idParams, body: updateServiceBody }),
  asyncHandler(ctrl.updateService),
);
router.delete('/:id', requireAdmin, validate({ params: idParams }), asyncHandler(ctrl.archiveService));

export default router;
