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

// Jobo's feed endpoint doesn't include a clean industry taxonomy field, so
// this approximates one from title/description keywords. It's a rough
// categorization for browsing/filtering, not an authoritative classification —
// worth replacing with a proper enrichment source if this matters more later.
const INDUSTRY_KEYWORDS = {
  Technology: ['software', 'engineer', 'developer', 'devops', 'data scientist', 'it ', 'programmer', 'cloud', 'cybersecurity'],
  Finance: ['accountant', 'finance', 'financial', 'audit', 'tax', 'bookkeeping', 'investment', 'banking'],
  Healthcare: ['nurse', 'medical', 'health', 'clinical', 'pharmac', 'doctor', 'therapist'],
  Marketing: ['marketing', 'seo', 'content', 'brand', 'social media', 'growth'],
  Sales: ['sales', 'account executive', 'business development', 'account manager'],
  Design: ['designer', 'ux', 'ui', 'graphic', 'product design'],
  Education: ['teacher', 'tutor', 'instructor', 'education', 'lecturer'],
  'Customer Support': ['customer support', 'customer service', 'support agent', 'help desk'],
  Operations: ['operations', 'logistics', 'supply chain', 'warehouse', 'procurement'],
  'Human Resources': ['hr ', 'human resources', 'recruiter', 'talent acquisition']
};

function classifyIndustry(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return industry;
  }
  return 'Other';
}

// Arbeitnow doesn't give a structured country field, but city/country
// names often appear in the "location" field or embedded in the
// description (frequently in German, e.g. "Standort: Frankfurt").
// This is a best-effort heuristic, not real geocoding — good enough for
// filtering, not authoritative. Arbeitnow is overwhelmingly a
// Germany/DACH-region job board (every listing footer literally links to
// "Jobs in Germany"), so a non-remote job with no other city/country
// signal defaults to Germany rather than staying null — remote jobs with
// no signal are left null since they could genuinely be anywhere.
const CITY_TO_COUNTRY = {
  germany: ['frankfurt', 'berlin', 'münchen', 'munich', 'düsseldorf', 'hamburg', 'köln', 'cologne',
    'stuttgart', 'leipzig', 'dresden', 'nürnberg', 'nuremberg', 'hannover', 'bremen', 'essen',
    'dortmund', 'bonn', 'mannheim', 'karlsruhe', 'deutschland'],
  austria: ['wien', 'vienna', 'salzburg', 'graz', 'innsbruck', 'österreich'],
  switzerland: ['zürich', 'zurich', 'genf', 'geneva', 'basel', 'bern', 'lausanne', 'schweiz'],
  netherlands: ['amsterdam', 'rotterdam', 'den haag', 'the hague', 'utrecht', 'niederlande'],
  'united kingdom': ['london', 'manchester', 'birmingham', 'united kingdom'],
  france: ['paris', 'lyon', 'marseille', 'frankreich'],
  spain: ['madrid', 'barcelona', 'spanien'],
  poland: ['warsaw', 'warszawa', 'krakow', 'kraków', 'polen'],
  italy: ['milan', 'milano', 'rome', 'roma', 'italien']
};

function parseCountryFromArbeitnowListing(location = '', description = '', remote = false) {
  const text = `${location} ${description}`.toLowerCase();

  for (const [country, keywords] of Object.entries(CITY_TO_COUNTRY)) {
    if (keywords.some((kw) => text.includes(kw))) {
      // Capitalize each word for display (e.g. "united kingdom" -> "United Kingdom")
      return country.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return remote ? null : 'Germany';
}
const MAX_ARBEITNOW_PAGES = 50; // safety cap against an unbounded loop
const ARBEITNOW_BASE_URL = 'https://arbeitnow.com/api/job-board-api';

// Arbeitnow is a free, public job board API — no API key required at all.
// Unlike Jobo, it doesn't give a structured "country" field, so country is
// derived heuristically via parseCountryFromArbeitnowListing() above.
// It DOES give a "tags" array (e.g. "Tech & Engineering",
// "Finance Risk & Compliance") that works well as a real industry
// category — more reliable than the keyword-based classifyIndustry()
// fallback used for Jobo, so it's used here when present.
export async function syncArbeitnowFeed() {
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
          country: parseCountryFromArbeitnowListing(listing.location, cleanDescription, listing.remote),
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

// Arbeitnow has no "closed job" endpoint like Jobo's — there's no reliable
// way to detect removals from this source, so Arbeitnow-sourced jobs rely
// on staleness alone. Consider this a known limitation of this free source.
export async function markStaleArbeitnowJobsClosed(staleDays = 21) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { source: 'arbeitnow', status: 'open', updatedAt: { $lt: cutoff } },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}

function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMON_SKILLS = [
  'javascript', 'typescript', 'react', 'node', 'python', 'java', 'sql',
  'excel', 'figma', 'project management', 'communication', 'sales',
  'marketing', 'accounting', 'aws', 'docker', 'kubernetes'
];

function extractSkillNamesFromText(text) {
  const lower = text.toLowerCase();
  return COMMON_SKILLS.filter((skill) => lower.includes(skill));
}
