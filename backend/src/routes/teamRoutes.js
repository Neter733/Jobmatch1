import { Router } from 'express';
import { requireAuth, requireManagerOrAbove } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createTeamMember,
  resetTeamMemberPassword,
  listTeam,
  getAnalytics,
  sendNotification,
  listJobSources,
  upsertJobSource,
  triggerAllJobSync,
  listEscalations,
  resolveEscalation,
  getPricing,
  updatePricing
} from '../controllers/teamController.js';

const router = Router();

router.use(requireAuth, requireManagerOrAbove);

router.post('/members', asyncHandler(createTeamMember));
router.post('/members/:id/reset-password', asyncHandler(resetTeamMemberPassword));
router.get('/members', asyncHandler(listTeam));
router.get('/analytics', asyncHandler(getAnalytics));
router.post('/notifications', asyncHandler(sendNotification));
router.get('/job-sources', asyncHandler(listJobSources));
router.post('/job-sources', asyncHandler(upsertJobSource));
router.post('/job-sources/sync-all', asyncHandler(triggerAllJobSync));
router.get('/escalations', asyncHandler(listEscalations));
router.post('/escalations/:id/resolve', asyncHandler(resolveEscalation));
router.get('/pricing', asyncHandler(getPricing));
router.post('/pricing', asyncHandler(updatePricing));

export default router;
