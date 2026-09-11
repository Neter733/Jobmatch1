import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  uploadCv,
  submitTypedCv,
  extractCoverLetterFromUpload,
  saveCoverLetterQuestionnaire
} from '../controllers/profileController.js';

const router = Router();

router.use(requireAuth);

router.post('/cv/upload', upload.single('file'), asyncHandler(uploadCv));
router.post('/cv/text', asyncHandler(submitTypedCv));

router.post('/cover-letter/extract', upload.single('file'), asyncHandler(extractCoverLetterFromUpload));
router.post('/cover-letter', asyncHandler(saveCoverLetterQuestionnaire));

export default router;
