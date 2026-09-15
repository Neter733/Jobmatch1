import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  bulkApply,
  paystackWebhook,
  verifyPaystackSignature,
  getCurrentPricing,
  getMyStats
} from '../controllers/applicationController.js';

const router = Router();

router.get('/pricing', requireAuth, asyncHandler(getCurrentPricing));
router.get('/my-stats', requireAuth, asyncHandler(getMyStats));
router.post('/bulk', requireAuth, asyncHandler(bulkApply));
router.post('/paystack/webhook', verifyPaystackSignature, asyncHandler(paystackWebhook));

export default router;
