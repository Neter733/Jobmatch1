import crypto from 'crypto';
import axios from 'axios';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { generateCoverLetter } from '../services/coverLetterService.js';
import { getPriceForCurrency } from '../services/pricingService.js';

// Paystack signs every webhook with HMAC-SHA512 of the raw request body,
// using your secret key. Verifying this is the only way to know a
// "payment successful" event actually came from Paystack and not
// someone hitting your endpoint directly to get free applications queued.
export function verifyPaystackSignature(req, res, next) {
  const signature = req.headers['x-paystack-signature'];

  if (!signature || !req.rawBody) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expectedHash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.rawBody)
    .digest('hex');

  if (expectedHash !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

// Lets the dashboard show the real, current price per application — set
// by the admin, not hardcoded on the frontend.
export async function getCurrentPricing(req, res) {
  const amount = await getPriceForCurrency(req.user.currency);
  res.json({ currency: req.user.currency, amount });
}

// Lets a user see how much they've spent and how many jobs they've
// applied to, on their own dashboard.
export async function getMyStats(req, res) {
  const [spentAgg, appliedCount, purchasedCount] = await Promise.all([
    Application.aggregate([
      { $match: { user: req.user._id, paymentStatus: 'paid' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' } } }
    ]),
    Application.countDocuments({ user: req.user._id, status: 'applied' }),
    Application.countDocuments({ user: req.user._id, paymentStatus: 'paid' })
  ]);

  res.json({
    totalSpent: spentAgg, // e.g. [{ _id: 'NGN', total: 60000 }]
    jobsAppliedCount: appliedCount, // actually submitted by staff
    applicationsPurchasedCount: purchasedCount // paid for, may still be queued
  });
}

export async function bulkApply(req, res) {
  const { jobIds } = req.body;
  const user = req.user;

  if (!jobIds?.length) return res.status(400).json({ error: 'No jobs selected' });

  const jobs = await Job.find({ _id: { $in: jobIds }, status: 'open' });
  const amountEach = await getPriceForCurrency(user.currency);

  const applications = await Application.insertMany(
    jobs.map((job) => ({
      user: user._id,
      job: job._id,
      amount: amountEach,
      currency: user.currency,
      status: 'pending_payment'
    }))
  );

  const totalAmount = amountEach * applications.length;

  // Paystack expects amount in kobo for NGN — adjust conversion if/when USD via Stripe is added
  const paystackRes = await axios.post(
    'https://api.paystack.co/transaction/initialize',
    {
      email: user.email,
      amount: totalAmount,
      currency: user.currency,
      metadata: { applicationIds: applications.map((a) => a._id) }
    },
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );

  res.json({ paymentUrl: paystackRes.data.data.authorization_url });
}

// Paystack webhook — confirms payment, then generates cover letters and
// queues the applications for the admin to manually submit
export async function paystackWebhook(req, res) {
  const event = req.body;

  if (event.event === 'charge.success') {
    const applicationIds = event.data.metadata?.applicationIds || [];
    const paymentRef = event.data.reference;

    const applications = await Application.find({ _id: { $in: applicationIds } })
      .populate('job')
      .populate('user');

    for (const application of applications) {
      // Paystack retries webhooks that don't get a fast 200 response —
      // skip anything already processed so a retry doesn't double-charge
      // work (regenerating cover letters, re-queuing) for the same payment.
      if (application.paymentStatus === 'paid') continue;

      const coverLetterUrl = await generateCoverLetter(application.user, application.job);

      application.coverLetterUrl = coverLetterUrl;
      application.paymentStatus = 'paid';
      application.paymentRef = paymentRef;
      application.status = 'queued';
      await application.save();
    }
  }

  res.sendStatus(200);
}
