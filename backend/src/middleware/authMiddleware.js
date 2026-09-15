import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.userId);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access only' });
  next();
}

// Any internal team member — staff, manager, or admin — can access the
// application queue and user profiles.
export function requireStaffOrAbove(req, res, next) {
  if (!['staff', 'manager', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Staff access only' });
  }
  next();
}

// Manager-only actions: viewing staff performance, resolving escalations,
// resetting staff passwords. Admin can do everything a manager can.
export function requireManagerOrAbove(req, res, next) {
  if (!['manager', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Manager access only' });
  }
  next();
}
