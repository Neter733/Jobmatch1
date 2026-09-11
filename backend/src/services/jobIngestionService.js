import axios from 'axios';
import Job from '../models/Job.js';
import SyncState from '../models/SyncState.js';

const JOBO_BASE_URL = 'https://connect.jobo.world';

const joboClient = axios.create({
  baseURL: JOBO_BASE_URL,
  headers: { 'X-Api-Key': process.env.JOBO_API_KEY }
});

// Jobo rate-limits like most usage-based APIs — a 429 means "back off",
// not "fail the whole sync". Retries with exponential backoff before
// giving up, so a single rate-limit hit during a large backfill doesn't
// abort the entire run.
async function requestWithRetry(fn, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      const isLastAttempt = attempt === retries;

      if (status === 429 && !isLastAttempt) {
        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const waitMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : 2 ** attempt * 1000; // 1s, 2s, 4s, 8s
        console.warn(`[jobo-sync] rate limited — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw err;
    }
  }
}

// Full backfill / ongoing sync using Jobo's cursor-paginated Feed API.
// Call this on a schedule (e.g. every 15-30 min). Resumes automatically
// from the last saved cursor — pass { fromScratch: true } to force a
// full re-backfill instead (cursor reset to null).
export async function syncJoboFeed({ workModels, fromScratch = false } = {}) {
  const state = await SyncState.findOneAndUpdate(
    { source: 'jobo' },
    { $setOnInsert: { source: 'jobo' } },
    { upsert: true, new: true }
  );

  let nextCursor = fromScratch ? null : state.lastCursor || null;
  let hasMore = true;
  let totalSynced = 0;

  while (hasMore) {
    const { data } = await requestWithRetry(() =>
      joboClient.post('/api/jobs/feed', {
        batch_size: 1000,
        cursor: nextCursor,
        ...(workModels ? { work_models: workModels } : {})
      })
    );

    for (const listing of data.jobs) {
      await Job.findOneAndUpdate(
        { source: 'jobo', externalId: listing.id },
        {
          title: listing.title,
          company: listing.company?.name,
          location: formatLocation(listing.locations),
          description: listing.description,
          applyLink: listing.apply_url || listing.listing_url,
          skillsExtracted: extractSkillNames(listing.qualifications),
          status: 'open',
          rawData: listing
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      totalSynced++;
    }

    nextCursor = data.next_cursor;
    hasMore = data.has_more;

    // Save progress after every batch so a crash mid-sync doesn't lose the cursor
    state.lastCursor = nextCursor;
    await state.save();
  }

  return { totalSynced, lastCursor: nextCursor };
}

// Call this on the same schedule as syncJoboFeed to mark jobs closed —
// far more reliable than guessing from staleness, since Jobo tracks
// removals directly from the source ATS.
export async function syncExpiredJobs() {
  const state = await SyncState.findOneAndUpdate(
    { source: 'jobo' },
    { $setOnInsert: { source: 'jobo' } },
    { upsert: true, new: true }
  );

  const since = state.lastExpiredSyncAt
    ? state.lastExpiredSyncAt.toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await requestWithRetry(() =>
    joboClient.get('/api/jobs/expired', {
      params: { expired_since: since, batch_size: 5000 }
    })
  );

  const expiredIds = data.expired_ids || data.ids || [];
  if (expiredIds.length) {
    await Job.updateMany(
      { source: 'jobo', externalId: { $in: expiredIds } },
      { status: 'closed' }
    );
  }

  state.lastExpiredSyncAt = new Date();
  await state.save();

  return { closedCount: expiredIds.length };
}

function formatLocation(locations = []) {
  if (!locations.length) return 'Location not specified';
  const first = locations[0];
  return [first.city, first.region, first.country].filter(Boolean).join(', ');
}

function extractSkillNames(qualifications) {
  if (!qualifications) return [];
  const mustHave = qualifications.must_have?.skills || [];
  const preferred = qualifications.preferred?.skills || [];
  return [...mustHave, ...preferred].map((s) => s.name.toLowerCase());
}
