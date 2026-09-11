import cron from 'node-cron';
import { syncJoboFeed, syncExpiredJobs } from '../services/jobIngestionService.js';
import SystemAlert from '../models/SystemAlert.js';

// Every 15 minutes: pull new/updated jobs, then mark closed ones.
// Adjust the cadence based on your Jobo plan's rate limits.
export function startJoboScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const feedResult = await syncJoboFeed();
      console.log(`[jobo-sync] synced ${feedResult.totalSynced} jobs`);

      const expiredResult = await syncExpiredJobs();
      console.log(`[jobo-sync] closed ${expiredResult.closedCount} expired jobs`);
    } catch (err) {
      await logJoboSyncError(err);
    }
  });

  console.log('Jobo sync scheduler started (every 15 min)');
}

// Jobo returns 401 for a missing/invalid key and 402 (not 403!) for an
// insufficient plan or empty wallet — these get written to SystemAlert so
// they show up in the admin dashboard, not just server logs an admin may
// never check until jobs have already gone stale.
async function logJoboSyncError(err) {
  const status = err.response?.status;

  if (status === 401) {
    console.error('[jobo-sync] AUTH FAILED — check JOBO_API_KEY in .env:', err.response?.data);
    await SystemAlert.create({
      type: 'jobo_auth_failed',
      message: 'Jobo API key is missing or invalid. Job syncing has stopped — update JOBO_API_KEY.'
    });
  } else if (status === 402) {
    console.error('[jobo-sync] BILLING ISSUE — Jobo wallet balance or plan insufficient:', err.response?.data);
    await SystemAlert.create({
      type: 'jobo_billing_issue',
      message: 'Jobo wallet balance or plan is insufficient. Job syncing has stopped — top up your Jobo account.'
    });
  } else {
    console.error('[jobo-sync] failed:', err.message);
    await SystemAlert.create({
      type: 'jobo_sync_error',
      message: `Job sync failed: ${err.message}`
    });
  }
}
