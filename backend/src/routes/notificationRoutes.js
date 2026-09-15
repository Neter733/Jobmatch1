import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMyNotifications, markNotificationRead } from '../controllers/notificationController.js';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(getMyNotifications));
router.post('/:id/read', asyncHandler(markNotificationRead));

export default router;
