import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './src/config/db.js';
import { startJoboScheduler } from './src/jobs/joboScheduler.js';

import authRoutes from './src/routes/authRoutes.js';
import jobRoutes from './src/routes/jobRoutes.js';
import applicationRoutes from './src/routes/applicationRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import profileRoutes from './src/routes/profileRoutes.js';

const app = express();

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

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);

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
