import Application from '../models/Application.js';
import SystemAlert from '../models/SystemAlert.js';
import { findReplacementForUser } from '../services/matchingService.js';
import { generateCoverLetter } from '../services/coverLetterService.js';
import {
  syncJoboFeed,
  syncExpiredJobs,
  syncArbeitnowFeed,
  markStaleArbeitnowJobsClosed
} from '../services/jobIngestionService.js';

export async function getAlerts(req, res) {
  const alerts = await SystemAlert.find({ resolved: false }).sort({ createdAt: -1 });
  res.json(alerts);
}

export async function resolveAlert(req, res) {
  await SystemAlert.findByIdAndUpdate(req.params.id, { resolved: true });
  res.json({ success: true });
}

export async function getQueue(req, res) {
  const applications = await Application.find({ status: { $in: ['queued', 'closed_pending_replacement'] } })
    .populate('user', 'name')
    .populate('job', 'title applyLink status');

  res.json(
    applications.map((a) => ({
      _id: a._id,
      applicantName: a.user.name,
      jobTitle: a.job.title,
      applyLink: a.job.applyLink,
      jobStatus: a.job.status,
      cvUrl: a.user.cvUrl,
      coverLetterUrl: a.coverLetterUrl
    }))
  );
}

export async function markApplied(req, res) {
  const application = await Application.findById(req.params.id);
  if (!application) return res.status(404).json({ error: 'Not found' });

  application.status = 'applied';
  application.appliedAt = new Date();
  await application.save();

  res.json({ success: true });
}

// Triggered from the admin queue when a job has closed before being applied to.
// Finds the user's next-best match, regenerates a cover letter for it, and
// swaps it into this application record rather than auto-submitting silently.
export async function replaceClosedJob(req, res) {
  const application = await Application.findById(req.params.id).populate('user').populate('job');
  if (!application) return res.status(404).json({ error: 'Not found' });

  const replacement = await findReplacementForUser(application.user, [String(application.job._id)]);
  if (!replacement) {
    application.status = 'closed_pending_replacement';
    await application.save();
    return res.json({ success: false, message: 'No replacement match found — consider a refund' });
  }

  application.job = replacement._id;
  application.matchScore = replacement.matchScore;
  application.coverLetterUrl = await generateCoverLetter(application.user, replacement);
  application.status = 'queued';
  await application.save();

  res.json({ success: true, replacement });
}

// Manual trigger — useful while testing, instead of waiting for the
// 15-minute cron cycle. Not exposed to regular users.
export async function triggerJoboSync(req, res) {
  const feedResult = await syncJoboFeed();
  const expiredResult = await syncExpiredJobs();
  res.json({ feedResult, expiredResult });
}

// Same idea for Arbeitnow — separate endpoint since it's a fully
// independent source with its own sync/closure logic.
export async function triggerArbeitnowSync(req, res) {
  const feedResult = await syncArbeitnowFeed();
  const closedResult = await markStaleArbeitnowJobsClosed();
  res.json({ feedResult, closedResult });
}
