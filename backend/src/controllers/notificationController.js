import Notification from '../models/Notification.js';

// Regular user's own notification inbox (announcements/offers sent by admin).
export async function getMyNotifications(req, res) {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(notifications);
}

export async function markNotificationRead(req, res) {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true }
  );
  res.json({ success: true });
}
