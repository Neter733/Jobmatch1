import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Application from '../models/Application.js';
import Notification from '../models/Notification.js';
import Escalation from '../models/Escalation.js';
import JobSource from '../models/JobSource.js';
import { listAllPrices, setPriceForCurrency } from '../services/pricingService.js';
import { syncJoboFeed, syncExpiredJobs, syncArbeitnowFeed, markStaleArbeitnowJobsClosed } from '../services/jobIngestionService.js';
import { syncJobicyFeed, markStaleJobicyJobsClosed } from '../services/jobicyService.js';
import { syncHimalayasFeed, closeExpiredHimalayasJobs } from '../services/himalayasService.js';
import { syncAdzunaFeed, markStaleAdzunaJobsClosed } from '../services/adzunaService.js';
import { syncEuresFeed, markStaleEuresJobsClosed } from '../services/euresService.js';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // considered "online" if active in the last 2 minutes

// --- Staff/manager account management (admin creates manager+staff; manager creates staff only) ---

export async function createTeamMember(req, res) {
  const { name, email, password, role } = req.body;

  if (!['staff', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'role must be "staff" or "manager"' });
  }
  // Only admin can create managers — managers can only create staff
  if (role === 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create manager accounts' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const member = await User.create({ name, email, passwordHash, role });

  res.json({ success: true, member: { id: member._id, name: member.name, email: member.email, role: member.role } });
}

export async function resetTeamMemberPassword(req, res) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const member = await User.findById(req.params.id);
  if (!member || !['staff', 'manager'].includes(member.role)) {
    return res.status(404).json({ error: 'Staff/manager account not found' });
  }
  if (member.role === 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can reset a manager\'s password' });
  }

  member.passwordHash = await bcrypt.hash(newPassword, 10);
  await member.save();
  res.json({ success: true });
}

// List staff/manager accounts with online status + today's completed count —
// used by the manager dashboard to see the team at a glance.
export async function listTeam(req, res) {
  const roles = req.user.role === 'admin' ? ['staff', 'manager'] : ['staff'];
  const team = await User.find({ role: { $in: roles } }).select('name email role lastActiveAt');

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const completedCounts = await Application.aggregate([
    { $match: { status: 'applied', appliedAt: { $gte: startOfToday }, completedBy: { $ne: null } } },
    { $group: { _id: '$completedBy', count: { $sum: 1 } } }
  ]);
  const countMap = Object.fromEntries(completedCounts.map((c) => [String(c._id), c.count]));

  res.json(
    team.map((member) => ({
      _id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
      isOnline: member.lastActiveAt && Date.now() - member.lastActiveAt.getTime() < ONLINE_THRESHOLD_MS,
      completedToday: countMap[String(member._id)] || 0
    }))
  );
}

// --- Regular user list + revenue/analytics for the admin dashboard ---

export async function listUsers(req, res) {
  const users = await User.find({ role: 'user' })
    .select('name email currency createdAt')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(users);
}

export async function getAnalytics(req, res) {
  const [userCount, totalApplications, appliedCount, revenueAgg, dailyRevenue] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Application.countDocuments(),
    Application.countDocuments({ status: 'applied' }),
    Application.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' } } }
    ]),
    // Last 30 days of paid revenue, grouped by day — feeds the growth chart
    Application.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  res.json({
    userCount,
    totalApplications,
    appliedCount,
    revenueByCurrency: revenueAgg, // e.g. [{ _id: 'NGN', total: 400000 }]
    dailyRevenue // [{ _id: '2026-09-01', revenue: 20000, count: 4 }, ...]
  });
}

// --- Notifications: admin sends announcements/offers to users ---

export async function sendNotification(req, res) {
  const { userIds, title, message } = req.body; // userIds: array, or omit to send to all users
  if (!title || !message) return res.status(400).json({ error: 'title and message are required' });

  const targetIds = userIds?.length ? userIds : (await User.find({ role: 'user' }).select('_id')).map((u) => u._id);

  await Notification.insertMany(targetIds.map((userId) => ({ user: userId, title, message })));
  res.json({ success: true, sentTo: targetIds.length });
}

// --- Job sources: admin manages credentials/on-off for existing connectors ---

export async function listJobSources(req, res) {
  const sources = await JobSource.find();

  // Known connectors, so the admin UI can show ones that haven't been
  // configured yet too (not just ones already in the database).
  const knownSources = [
    { key: 'jobo', label: 'Jobo', needsKey: true, keyFormat: 'single API key', defaultEnabled: true },
    { key: 'arbeitnow', label: 'Arbeitnow', needsKey: false, keyFormat: null, defaultEnabled: true },
    { key: 'jobicy', label: 'Jobicy', needsKey: false, keyFormat: null, defaultEnabled: true },
    { key: 'himalayas', label: 'Himalayas', needsKey: false, keyFormat: null, defaultEnabled: true },
    { key: 'adzuna', label: 'Adzuna', needsKey: true, keyFormat: '"app_id:app_key"', defaultEnabled: true },
    { key: 'eures', label: 'EURES (unofficial, off by default)', needsKey: false, keyFormat: null, defaultEnabled: false }
  ];

  const merged = knownSources.map((known) => {
    const existing = sources.find((s) => s.key === known.key);
    return {
      ...known,
      enabled: existing?.enabled ?? known.defaultEnabled,
      hasApiKey: Boolean(existing?.apiKey),
      notes: existing?.notes || ''
    };
  });

  res.json(merged);
}

export async function upsertJobSource(req, res) {
  const { key, label, apiKey, enabled, notes } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key and label are required' });

  const source = await JobSource.findOneAndUpdate(
    { key },
    { label, apiKey, enabled: enabled ?? true, notes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, source });
}

// Manually trigger every source's sync right now — useful for testing
// instead of waiting for the 15-minute cron, and for confirming a newly
// added API key actually works before walking away from the admin panel.
export async function triggerAllJobSync(req, res) {
  const results = {};

  const runners = {
    jobo: async () => {
      const feed = await syncJoboFeed();
      const closed = await syncExpiredJobs();
      return { ...feed, closedCount: closed.closedCount };
    },
    arbeitnow: async () => {
      const feed = await syncArbeitnowFeed();
      const closed = await markStaleArbeitnowJobsClosed();
      return { ...feed, closedCount: closed.closedCount };
    },
    jobicy: async () => {
      const feed = await syncJobicyFeed();
      const closed = await markStaleJobicyJobsClosed();
      return { ...feed, closedCount: closed.closedCount };
    },
    himalayas: async () => {
      const feed = await syncHimalayasFeed();
      const closed = await closeExpiredHimalayasJobs();
      return { ...feed, closedCount: closed.closedCount };
    },
    adzuna: async () => {
      const feed = await syncAdzunaFeed();
      const closed = await markStaleAdzunaJobsClosed();
      return { ...feed, closedCount: closed.closedCount };
    },
    eures: async () => {
      const feed = await syncEuresFeed();
      const closed = await markStaleEuresJobsClosed();
      return { ...feed, closedCount: closed.closedCount };
    }
  };

  for (const [name, run] of Object.entries(runners)) {
    try {
      results[name] = await run();
    } catch (err) {
      results[name] = { error: err.message };
    }
  }

  res.json(results);
}

// --- Escalations: manager reviews what staff flagged ---

export async function listEscalations(req, res) {
  const escalations = await Escalation.find({ status: 'open' })
    .populate('raisedBy', 'name')
    .populate('aboutUser', 'name email')
    .sort({ createdAt: -1 });
  res.json(escalations);
}

export async function resolveEscalation(req, res) {
  await Escalation.findByIdAndUpdate(req.params.id, { status: 'resolved' });
  res.json({ success: true });
}

// --- Pricing: admin sets the per-application fee, per currency ---

export async function getPricing(req, res) {
  const prices = await listAllPrices(); // e.g. { NGN: 20000, USD: 100 } — minor units
  res.json(prices);
}

export async function updatePricing(req, res) {
  const { currency, amount } = req.body;
  if (!currency || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'currency and a positive amount (in minor units) are required' });
  }

  await setPriceForCurrency(currency, amount);
  res.json({ success: true });
}
