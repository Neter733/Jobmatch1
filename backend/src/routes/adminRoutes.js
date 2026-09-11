import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getQueue, markApplied, replaceClosedJob, triggerJoboSync, getAlerts, resolveAlert } from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/queue', asyncHandler(getQueue));
router.post('/queue/:id/mark-applied', asyncHandler(markApplied));
router.post('/queue/:id/replace-closed-job', asyncHandler(replaceClosedJob));
router.post('/sync-jobs', asyncHandler(triggerJoboSync));
router.get('/alerts', asyncHandler(getAlerts));
router.post('/alerts/:id/resolve', asyncHandler(resolveAlert));

export default router;
