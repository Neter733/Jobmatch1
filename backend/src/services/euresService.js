import axios from 'axios';
import Job from '../models/Job.js';
import { getSourceConfig, classifyIndustry, extractSkillNamesFromText } from './jobSourceUtils.js';

const EURES_BASE_URL = 'https://europa.eu/eures/api/jv-searchengine/public/jv-search/search';
const MAX_EURES_PAGES = 20;

// IMPORTANT — read before relying on this one: EURES (the EU's official
// job portal) has no officially documented public API. This calls the
// same internal endpoint the EURES website itself uses, reverse-engineered
// by third-party developers. It works as of when this was built, but the
// EU could change or break it without notice, since it's not a supported
// integration point. Parsing below is deliberately defensive (checks
// several possible field names) for exactly that reason.
//
// Disabled by default — an admin must explicitly enable it on the Job
// Sources page after confirming it's still returning real jobs, rather
// than it silently running for everyone the moment this code deploys.
export async function syncEuresFeed() {
  const { enabled } = await getSourceConfig('eures', null, false);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'EURES is off by default — enable it in the admin Job Sources page' };

  let page = 1;
  let totalSynced = 0;

  while (page <= MAX_EURES_PAGES) {
    let data;
    try {
      const response = await axios.post(EURES_BASE_URL, {
        resultsPerPage: 100,
        page,
        sortSearch: 'MOST_RECENT',
        keywords: [],
        locationCodes: [],
        sectorCodes: [],
        requestLanguage: 'en',
        sessionId: `jobmatch-sync-${Date.now()}`
      });
      data = response.data;
    } catch (err) {
      console.error(`[eures-sync] request failed on page ${page} — endpoint may have changed:`, err.message);
      break; // stop rather than retry an endpoint that might be gone
    }

    // Defensive: the exact response shape isn't officially documented,
    // so check several plausible locations for the results array.
    const listings = data?.content || data?.results || data?.jvSearchResultDtos || data?.jobs || [];
    if (!listings.length) break;

    for (const listing of listings) {
      const id = listing.id || listing.jvId || listing.identifier || listing.documentId;
      if (!id) continue; // skip anything we can't even identify

      const title = listing.title || listing.jobTitle;
      const employer = listing.employer?.name || listing.company?.name || listing.employerName || listing.company || null;
      const country = listing.locations?.[0]?.country || listing.locationCodes?.[0] || listing.countryCode || null;
      const description = listing.description?.text || listing.description || listing.snippet || '';
      const applyUrl = listing.url || `https://europa.eu/eures/portal/jv-se/jv-details/${id}?lang=en`;

      if (!title) continue;

      await Job.findOneAndUpdate(
        { source: 'eures', externalId: String(id) },
        {
          title,
          company: employer,
          location: country,
          country,
          industry: classifyIndustry(title, description),
          description: typeof description === 'string' ? description : '',
          applyLink: applyUrl,
          skillsExtracted: extractSkillNamesFromText(typeof description === 'string' ? description : ''),
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

export async function markStaleEuresJobsClosed(staleDays = 21) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { source: 'eures', status: 'open', updatedAt: { $lt: cutoff } },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}
