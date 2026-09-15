import axios from 'axios';
import Job from '../models/Job.js';
import SyncState from '../models/SyncState.js';
import { getSourceConfig, splitPairedKey, extractSkillNamesFromText } from './jobSourceUtils.js';

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs';

// Adzuna's free tier is tight — roughly 1,000 calls/month (~33/day).
// Rather than call it on the same 15-minute cycle as everything else
// (which would exhaust the monthly quota in hours), this only actually
// runs once every ~20 hours, tracked via SyncState. A fixed, small set of
// countries keeps usage predictable: 5 calls per run, once a day, is
// ~150/month — safely under quota with room for manual testing.
const ADZUNA_COUNTRIES = ['gb', 'us', 'za', 'de', 'au']; // UK, US, South Africa, Germany, Australia
const MIN_HOURS_BETWEEN_RUNS = 20;

// Requires BOTH an app_id and app_key from Adzuna. Store them in the
// admin panel's Job Sources page as a single value in this exact format:
// "app_id:app_key" — e.g. "a1b2c3d4:e5f6g7h8i9j0"
export async function syncAdzunaFeed() {
  const { enabled, apiKey } = await getSourceConfig('adzuna', process.env.ADZUNA_CREDENTIALS);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'Adzuna source disabled in admin panel' };

  const { id: appId, key: appKey } = splitPairedKey(apiKey);
  if (!appId || !appKey) {
    return { totalSynced: 0, skipped: true, reason: 'Adzuna needs "app_id:app_key" — set it in the admin Job Sources page' };
  }

  const state = await SyncState.findOneAndUpdate(
    { source: 'adzuna' },
    { $setOnInsert: { source: 'adzuna' } },
    { upsert: true, new: true }
  );

  const hoursSinceLastRun = state.lastRunAt ? (Date.now() - state.lastRunAt.getTime()) / (1000 * 60 * 60) : Infinity;
  if (hoursSinceLastRun < MIN_HOURS_BETWEEN_RUNS) {
    return { totalSynced: 0, skipped: true, reason: `Throttled — Adzuna only runs once per ~${MIN_HOURS_BETWEEN_RUNS}h to protect the free quota` };
  }

  let totalSynced = 0;

  for (const country of ADZUNA_COUNTRIES) {
    try {
      const { data } = await axios.get(`${ADZUNA_BASE_URL}/${country}/search/1`, {
        params: {
          app_id: appId,
          app_key: appKey,
          results_per_page: 50,
          'content-type': 'application/json'
        }
      });

      for (const listing of data.results || []) {
        await Job.findOneAndUpdate(
          { source: 'adzuna', externalId: String(listing.id) },
          {
            title: listing.title,
            company: listing.company?.display_name,
            location: listing.location?.display_name,
            country: countryCodeToName(country),
            // Adzuna's own category taxonomy is real and specific
            // (Healthcare & Nursing Jobs, Engineering Jobs, Hospitality &
            // Catering Jobs, etc.) — this is the best industry signal of
            // any source integrated so far.
            industry: listing.category?.label || 'Other',
            description: listing.description,
            applyLink: listing.redirect_url,
            skillsExtracted: extractSkillNamesFromText(listing.description || ''),
            status: 'open',
            rawData: listing
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
        totalSynced++;
      }
    } catch (err) {
      console.error(`[adzuna-sync] failed for country ${country}:`, err.message);
      // Continue with the other countries even if one fails
    }
  }

  state.lastRunAt = new Date();
  await state.save();

  return { totalSynced };
}

function countryCodeToName(code) {
  const map = { gb: 'United Kingdom', us: 'United States', za: 'South Africa', de: 'Germany', au: 'Australia' };
  return map[code] || code.toUpperCase();
}

export async function markStaleAdzunaJobsClosed(staleDays = 14) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { source: 'adzuna', status: 'open', updatedAt: { $lt: cutoff } },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}
