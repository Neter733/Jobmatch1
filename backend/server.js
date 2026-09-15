import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDB } from './src/config/db.js';
import { startJoboScheduler } from './src/jobs/joboScheduler.js';

import authRoutes from './src/routes/authRoutes.js';
import jobRoutes from './src/routes/jobRoutes.js';
import applicationRoutes from './src/routes/applicationRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import profileRoutes from './src/routes/profileRoutes.js';
import staffRoutes from './src/routes/staffRoutes.js';
import teamRoutes from './src/routes/teamRoutes.js';
import messageRoutes from './src/routes/messageRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';

const app = express();

// Sets a batch of standard security-related HTTP headers (X-Content-Type-Options,
// X-Frame-Options, etc.) — a baseline every production Express app should have.
app.use(helmet());

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(
  express.json({
    // Paystack signature verification needs the raw, unparsed body —
    // capture it alongside the parsed JSON so the webhook can hash it.
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

// Strips any key starting with '$' or containing '.' from req.body/req.query/
// req.params — prevents NoSQL injection via crafted MongoDB query operators
// (e.g. { "email": { "$gt": "" } } as a login payload).
app.use(mongoSanitize());

// Brute-force protection on login endpoints specifically — these are the
// highest-value targets for an attacker guessing passwords. 20 attempts
// per 15 minutes per IP is generous for a real user, tight for a script.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait a few minutes and try again.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Global error handler — without this, an unhandled exception anywhere
// (missing API key, bad file, etc.) returns Express's default HTML error
// page instead of JSON, which is why the frontend was showing a generic
// "Something went wrong" instead of the real reason.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong on our end.'
  });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  startJoboScheduler();
});
