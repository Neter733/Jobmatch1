import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(payload.userId);

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }
}


// Admin-only access.
// Supports both the old isAdmin flag and the newer role system.
export function requireAdmin(req, res, next) {
  const isAdmin =
    req.user?.isAdmin === true ||
    req.user?.role === 'admin';

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Admin access only'
    });
  }

  next();
}


// Staff, manager, or admin.
// Legacy isAdmin accounts are also accepted.
export function requireStaffOrAbove(req, res, next) {
  const hasAccess =
    req.user?.isAdmin === true ||
    ['staff', 'manager', 'admin'].includes(req.user?.role);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'Staff access only'
    });
  }

  next();
}


// Manager or admin.
// Legacy isAdmin accounts are treated as admin.
export function requireManagerOrAbove(req, res, next) {
  const hasAccess =
    req.user?.isAdmin === true ||
    ['manager', 'admin'].includes(req.user?.role);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'Manager access only'
    });
  }

  next();
}
