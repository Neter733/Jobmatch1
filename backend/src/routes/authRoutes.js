import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { register, login, googleAuth, adminLogin, seedAdmin } from '../controllers/authController.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/google', asyncHandler(googleAuth));
router.post('/admin-login', asyncHandler(adminLogin));
router.get('/seed-admin', asyncHandler(seedAdmin));

export default router;
