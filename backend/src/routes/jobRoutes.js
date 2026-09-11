import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMatches } from '../controllers/jobController.js';

const router = Router();

router.get('/matches', requireAuth, asyncHandler(getMatches));

export default router;
