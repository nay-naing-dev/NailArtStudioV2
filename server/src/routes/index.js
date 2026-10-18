import { Router } from 'express';
import authRoutes from './auth.routes.js';
import designRoutes from './designs.routes.js';
import serviceRoutes from './services.routes.js';
import promotionRoutes from './promotions.routes.js';
import appointmentRoutes from './appointments.routes.js';
import tryonRoutes from './tryon.routes.js';
import artistRoutes from './artists.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/services', serviceRoutes);
router.use('/promotions', promotionRoutes);
router.use('/designs', designRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/tryon', tryonRoutes);
router.use('/artists', artistRoutes);
router.use('/admin', adminRoutes);

export default router;
