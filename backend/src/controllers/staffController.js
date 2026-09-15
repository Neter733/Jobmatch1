import Application from '../models/Application.js';
import User from '../models/User.js';
import Escalation from '../models/Escalation.js';
import { findReplacementForUser } from '../services/matchingService.js';
import { generateCoverLetter } from '../services/coverLetterService.js';
import { sendApplicationCompletedEmail } from '../services/emailService.js';

// Shared by staff, manager, and admin — the actual application queue
// they work from all day.
export async function getQueue(req, res) {
  const applications = await Application.find({ status: { $in: ['queued', 'closed_pending_replacement'] } })
    .populate('user', 'name email')
    .populate('job', 'title applyLink status')
    .sort({ createdAt: 1 }); // oldest paid application first

  res.json(
    applications.map((a) => ({
      _id: a._id,
      applicantId: a.user._id,
      applicantName: a.user.name,
      applicantEmail: a.user.email,
      jobTitle: a.job.title,
      applyLink: a.job.applyLink,
      jobStatus: a.job.status,
      coverLetterUrl: a.coverLetterUrl,
      createdAt: a.createdAt
    }))
  );
}

export async function markApplied(req, res) {
  const application = await Application.findById(req.params.id).populate('user', 'name email');
  if (!application) return res.status(404).json({ error: 'Not found' });

  application.status = 'applied';
  application.appliedAt = new Date();
  application.completedBy = req.user._id;
  await application.save();

  await sendApplicationCompletedEmail(application.user.email, application.user.name);

  res.json({ success: true });
}

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

// Full profile view for a single user — opened in a new tab from the
// staff/admin user list. Everything a staff member needs to work an
// account from one screen: their info, purchased applications (with CV
// and cover letter links), and their current job matches (so staff can
// manually pick a replacement if a link is dead/closed).
export async function getUserProfile(req, res) {
  const user = await User.findById(req.params.id).select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const applications = await Application.find({ user: user._id })
    .populate('job', 'title company location applyLink status')
    .sort({ createdAt: -1 });

  const { findMatchesForUser } = await import('../services/matchingService.js');
  const currentMatches = await findMatchesForUser(user, 10);

  res.json({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      currency: user.currency,
      cvUrl: user.cvUrl,
      createdAt: user.createdAt
    },
    applications: applications.map((a) => ({
      _id: a._id,
      jobTitle: a.job?.title,
      company: a.job?.company,
      applyLink: a.job?.applyLink,
      jobStatus: a.job?.status,
      coverLetterUrl: a.coverLetterUrl,
      status: a.status,
      amount: a.amount,
      currency: a.currency,
      createdAt: a.createdAt
    })),
    currentMatches
  });
}

// Staff flags an account for manager attention.
export async function escalateAccount(req, res) {
  const { aboutUserId, message } = req.body;
  if (!aboutUserId || !message) {
    return res.status(400).json({ error: 'aboutUserId and message are required' });
  }

  const escalation = await Escalation.create({
    raisedBy: req.user._id,
    aboutUser: aboutUserId,
    message
  });

  res.json({ success: true, escalation });
}

// Called every ~30s by staff/manager/admin dashboards while a tab is open,
// so managers can see who's genuinely active right now.
export async function heartbeat(req, res) {
  req.user.lastActiveAt = new Date();
  await req.user.save();
  res.json({ success: true });
}
