import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMatches, browseJobs, getJobFilters } from '../controllers/jobController.js';

const router = Router();

// Public — no auth required, so people can browse jobs before signing up
router.get('/browse', asyncHandler(browseJobs));
router.get('/filters', asyncHandler(getJobFilters));

// Requires a logged-in user with a saved CV/skills profile
router.get('/matches', requireAuth, asyncHandler(getMatches));

export default router;
