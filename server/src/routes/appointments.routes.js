import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/appointments.controller.js';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  availabilityQuery,
  createAppointmentBody,
  idParams,
  listAppointmentsQuery,
  updateStatusBody,
} from '../validators/schemas.js';

const router = Router();
const bookingLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

// Public / customer
router.get('/availability', validate({ query: availabilityQuery }), asyncHandler(ctrl.availability));
router.post(
  '/',
  bookingLimiter,
  optionalAuth,
  validate({ body: createAppointmentBody }),
  asyncHandler(ctrl.createAppointment),
);
router.get('/mine', requireAuth, asyncHandler(ctrl.myAppointments));
router.patch('/:id/cancel', requireAuth, validate({ params: idParams }), asyncHandler(ctrl.cancelAppointment));

// Admin
router.get('/stats', requireAdmin, asyncHandler(ctrl.appointmentStats));
router.get('/', requireAdmin, validate({ query: listAppointmentsQuery }), asyncHandler(ctrl.listAppointments));
router.patch(
  '/:id/status',
  requireAdmin,
  validate({ params: idParams, body: updateStatusBody }),
  asyncHandler(ctrl.updateAppointmentStatus),
);

export default router;
