import axios from 'axios';
import Job from '../models/Job.js';
import { getSourceConfig, stripHtml, classifyIndustry, extractSkillNamesFromText } from './jobSourceUtils.js';
import { requestWithRetry } from './jobIngestionService.js';

const HIMALAYAS_BASE_URL = 'https://himalayas.app/jobs/api/search';
const MAX_HIMALAYAS_PAGES = 30; // safety cap — ~20 jobs/page per their docs

// Himalayas is free, public, no API key. Has real locationRestrictions
// (with country name + alpha2 code) and categories/parentCategories —
// genuinely structured data, no heuristics needed for country or industry.
export async function syncHimalayasFeed() {
  const { enabled } = await getSourceConfig('himalayas', null);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'Himalayas source disabled in admin panel' };

  let page = 1;
  let totalSynced = 0;

  while (page <= MAX_HIMALAYAS_PAGES) {
    const { data } = await requestWithRetry(() =>
      axios.get(HIMALAYAS_BASE_URL, { params: { sort: 'recent', page } })
    );

    const listings = data.jobs || data.results || [];
    if (!listings.length) break;

    for (const listing of listings) {
      const cleanDescription = stripHtml(listing.description || '');
      const locationName = listing.locationRestrictions?.[0]?.name || 'Worldwide';

      await Job.findOneAndUpdate(
        { source: 'himalayas', externalId: listing.guid },
        {
          title: listing.title,
          company: listing.companyName,
          location: locationName,
          country: listing.locationRestrictions?.length === 1 ? locationName : null,
          industry: listing.parentCategories?.[0] || listing.categories?.[0] || classifyIndustry(listing.title, cleanDescription),
          description: cleanDescription,
          applyLink: listing.applicationLink,
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

// Himalayas gives an expiresAt/expiryDate per job — use it directly rather
// than guessing from staleness, since it's real data from the source.
export async function closeExpiredHimalayasJobs() {
  const now = new Date();
  const result = await Job.updateMany(
    {
      source: 'himalayas',
      status: 'open',
      'rawData.expiryDate': { $ne: null, $lt: now.getTime() }
    },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}
