import axios from 'axios';
import Job from '../models/Job.js';
import SyncState from '../models/SyncState.js';
import { getSourceConfig, classifyIndustry, stripHtml, parseCountryFromText, extractSkillNamesFromText } from './jobSourceUtils.js';

const JOBO_BASE_URL = 'https://connect.jobo.world';

function joboClientWithKey(apiKey) {
  return axios.create({
    baseURL: JOBO_BASE_URL,
    headers: { 'X-Api-Key': apiKey }
  });
}

// Jobo rate-limits like most usage-based APIs — a 429 means "back off",
// not "fail the whole sync". Retries with exponential backoff before
// giving up, so a single rate-limit hit during a large backfill doesn't
// abort the entire run. Reused by other sources too.
export async function requestWithRetry(fn, retries = 4) {
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
        console.warn(`[sync] rate limited — retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw err;
    }
  }
}

// Full backfill / ongoing sync using Jobo's cursor-paginated Feed API.
// Resumes automatically from the last saved cursor.
export async function syncJoboFeed({ workModels, fromScratch = false } = {}) {
  const { enabled, apiKey } = await getSourceConfig('jobo', process.env.JOBO_API_KEY);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'Jobo source disabled in admin panel' };

  const joboClient = joboClientWithKey(apiKey);

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
          country: listing.locations?.[0]?.country || null,
          industry: classifyIndustry(listing.title, listing.description),
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
    state.lastCursor = nextCursor;
    await state.save();
  }

  return { totalSynced, lastCursor: nextCursor };
}

export async function syncExpiredJobs() {
  const { enabled, apiKey } = await getSourceConfig('jobo', process.env.JOBO_API_KEY);
  if (!enabled) return { closedCount: 0, skipped: true };

  const joboClient = joboClientWithKey(apiKey);

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

const MAX_ARBEITNOW_PAGES = 50;
const ARBEITNOW_BASE_URL = 'https://arbeitnow.com/api/job-board-api';

// Arbeitnow is free, public, no API key. Has a "tags" array used directly
// as industry when present — more reliable than the keyword fallback.
export async function syncArbeitnowFeed() {
  const { enabled } = await getSourceConfig('arbeitnow', null);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'Arbeitnow source disabled in admin panel' };

  let page = 1;
  let totalSynced = 0;

  while (page <= MAX_ARBEITNOW_PAGES) {
    const { data } = await axios.get(ARBEITNOW_BASE_URL, { params: { page } });
    const listings = data.data || [];
    if (!listings.length) break;

    for (const listing of listings) {
      const cleanDescription = stripHtml(listing.description);

      await Job.findOneAndUpdate(
        { source: 'arbeitnow', externalId: listing.slug },
        {
          title: listing.title,
          company: listing.company_name,
          location: listing.location || (listing.remote ? 'Remote' : 'Not specified'),
          country: parseCountryFromText(listing.location, cleanDescription, listing.remote, 'Germany'),
          industry: listing.tags?.[0] || classifyIndustry(listing.title, cleanDescription),
          description: cleanDescription,
          applyLink: listing.url,
          skillsExtracted: extractSkillNamesFromText(cleanDescription),
          status: 'open',
          rawData: listing
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      totalSynced++;
    }

    page++;
  }

  return { totalSynced };
}

export async function markStaleArbeitnowJobsClosed(staleDays = 21) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { source: 'arbeitnow', status: 'open', updatedAt: { $lt: cutoff } },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}
