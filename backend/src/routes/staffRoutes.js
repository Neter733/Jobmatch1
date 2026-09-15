import { Router } from 'express';
import { requireAuth, requireStaffOrAbove } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getQueue,
  markApplied,
  replaceClosedJob,
  getUserProfile,
  escalateAccount,
  heartbeat
} from '../controllers/staffController.js';
import { listUsers } from '../controllers/teamController.js';

const router = Router();

router.use(requireAuth, requireStaffOrAbove);

router.get('/queue', asyncHandler(getQueue));
router.post('/queue/:id/mark-applied', asyncHandler(markApplied));
router.post('/queue/:id/replace-closed-job', asyncHandler(replaceClosedJob));
router.get('/users', asyncHandler(listUsers));
router.get('/users/:id', asyncHandler(getUserProfile));
router.post('/escalate', asyncHandler(escalateAccount));
router.post('/heartbeat', asyncHandler(heartbeat));

export default router;
