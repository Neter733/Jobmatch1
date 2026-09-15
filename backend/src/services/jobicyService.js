import axios from 'axios';
import Job from '../models/Job.js';
import { getSourceConfig, stripHtml, parseCountryFromText, classifyIndustry, extractSkillNamesFromText } from './jobSourceUtils.js';

const JOBICY_BASE_URL = 'https://jobicy.com/api/v2/remote-jobs';

// Jobicy is free, public, no API key. Remote-only listings, but has a
// real jobIndustry field (development, design, marketing, data-science,
// finance, HR, writing, DevOps, etc.) — used directly as industry.
export async function syncJobicyFeed() {
  const { enabled } = await getSourceConfig('jobicy', null);
  if (!enabled) return { totalSynced: 0, skipped: true, reason: 'Jobicy source disabled in admin panel' };

  const { data } = await axios.get(JOBICY_BASE_URL, { params: { count: 200 } });
  const listings = data.jobs || [];
  let totalSynced = 0;

  for (const listing of listings) {
    const cleanDescription = stripHtml(listing.jobDescription || listing.jobExcerpt || '');

    await Job.findOneAndUpdate(
      { source: 'jobicy', externalId: String(listing.id) },
      {
        title: listing.jobTitle,
        company: listing.companyName,
        location: listing.jobGeo || 'Remote',
        country: parseCountryFromText(listing.jobGeo, '', true, null),
        industry: listing.jobIndustry?.[0] || classifyIndustry(listing.jobTitle, cleanDescription),
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

  return { totalSynced };
}

// No closed-job signal from Jobicy — same staleness-based approach as Arbeitnow.
export async function markStaleJobicyJobsClosed(staleDays = 21) {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { source: 'jobicy', status: 'open', updatedAt: { $lt: cutoff } },
    { status: 'closed' }
  );
  return { closedCount: result.modifiedCount };
}
