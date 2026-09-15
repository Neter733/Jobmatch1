import cron from 'node-cron';
import { syncJoboFeed, syncExpiredJobs, syncArbeitnowFeed, markStaleArbeitnowJobsClosed } from '../services/jobIngestionService.js';
import { syncJobicyFeed, markStaleJobicyJobsClosed } from '../services/jobicyService.js';
import { syncHimalayasFeed, closeExpiredHimalayasJobs } from '../services/himalayasService.js';
import { syncAdzunaFeed, markStaleAdzunaJobsClosed } from '../services/adzunaService.js';
import { syncEuresFeed, markStaleEuresJobsClosed } from '../services/euresService.js';
import SystemAlert from '../models/SystemAlert.js';

// Every 15 minutes, sync every job source. Each runs in its own try/catch
// so a failure in one never blocks the others. Adzuna self-throttles
// internally to once a day regardless of this 15-minute cycle, to protect
// its very tight free quota.
export function startJoboScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    await runSourceSync('jobo', async () => {
      const feedResult = await syncJoboFeed();
      const expiredResult = await syncExpiredJobs();
      return { ...feedResult, closedCount: expiredResult.closedCount };
    }, logJoboSyncError);

    await runSourceSync('arbeitnow', async () => {
      const feedResult = await syncArbeitnowFeed();
      const closedResult = await markStaleArbeitnowJobsClosed();
      return { ...feedResult, closedCount: closedResult.closedCount };
    });

    await runSourceSync('jobicy', async () => {
      const feedResult = await syncJobicyFeed();
      const closedResult = await markStaleJobicyJobsClosed();
      return { ...feedResult, closedCount: closedResult.closedCount };
    });

    await runSourceSync('himalayas', async () => {
      const feedResult = await syncHimalayasFeed();
      const closedResult = await closeExpiredHimalayasJobs();
      return { ...feedResult, closedCount: closedResult.closedCount };
    });

    await runSourceSync('adzuna', async () => {
      const feedResult = await syncAdzunaFeed();
      const closedResult = await markStaleAdzunaJobsClosed();
      return { ...feedResult, closedCount: closedResult.closedCount };
    });

    await runSourceSync('eures', async () => {
      const feedResult = await syncEuresFeed();
      const closedResult = await markStaleEuresJobsClosed();
      return { ...feedResult, closedCount: closedResult.closedCount };
    });
  });

  console.log('Job sync scheduler started (every 15 min) — Jobo, Arbeitnow, Jobicy, Himalayas, Adzuna, EURES');
}

async function runSourceSync(name, syncFn, customErrorHandler) {
  try {
    const result = await syncFn();
    if (result.skipped) {
      console.log(`[${name}-sync] skipped — ${result.reason}`);
    } else {
      console.log(`[${name}-sync] synced ${result.totalSynced} jobs, closed ${result.closedCount ?? 0}`);
    }
  } catch (err) {
    if (customErrorHandler) {
      await customErrorHandler(err);
    } else {
      console.error(`[${name}-sync] failed:`, err.message);
      await SystemAlert.create({ type: 'job_sync_error', message: `${name} sync failed: ${err.message}` });
    }
  }
}

// Jobo returns 401 for a missing/invalid key and 402 for an insufficient
// plan or empty wallet — these get written to SystemAlert so they show up
// in the admin dashboard, not just server logs.
async function logJoboSyncError(err) {
  const status = err.response?.status;

  if (status === 401) {
    console.error('[jobo-sync] AUTH FAILED — check JOBO_API_KEY:', err.response?.data);
    await SystemAlert.create({
      type: 'jobo_auth_failed',
      message: 'Jobo API key is missing or invalid. Job syncing has stopped — update the key in the admin Job Sources page.'
    });
  } else if (status === 402) {
    console.error('[jobo-sync] BILLING ISSUE:', err.response?.data);
    await SystemAlert.create({
      type: 'jobo_billing_issue',
      message: 'Jobo wallet balance or plan is insufficient. Job syncing has stopped — top up your Jobo account.'
    });
  } else {
    console.error('[jobo-sync] failed:', err.message);
    await SystemAlert.create({ type: 'jobo_sync_error', message: `Jobo sync failed: ${err.message}` });
  }
}
