import { Router } from 'express';
import * as ctrl from '../controllers/artists.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(ctrl.listArtists));

export default router;
