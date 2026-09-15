import { Router } from 'express';
import { requireAuth, requireStaffOrAbove } from '../middleware/authMiddleware.js';
import { chatUpload } from '../middleware/uploadMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listContacts, getMessages, sendMessage, getUnreadCounts } from '../controllers/messageController.js';

const router = Router();

router.use(requireAuth, requireStaffOrAbove);

router.get('/contacts', asyncHandler(listContacts));
router.get('/messages', asyncHandler(getMessages));
router.post('/messages', chatUpload.single('file'), asyncHandler(sendMessage));
router.get('/unread-counts', asyncHandler(getUnreadCounts));

export default router;
