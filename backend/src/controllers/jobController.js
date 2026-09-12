import Job from '../models/Job.js';
import { findMatchesForUser } from '../services/matchingService.js';

export async function getMatches(req, res) {
  const matches = await findMatchesForUser(req.user);
  res.json(matches);
}

// Public job browsing — no auth required. Newest first by default, with
// optional country/industry filters. Paginated so the page doesn't try to
// load the entire jobs collection at once.
export async function browseJobs(req, res) {
  const { q, country, industry, page = 1, pageSize = 24 } = req.query;

  const filter = { status: 'open' };
  if (country) filter.country = country;
  if (industry) filter.industry = industry;
  if (q) filter.$text = { $search: q };

  const skip = (Number(page) - 1) * Number(pageSize);

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(pageSize))
      .select('title company location country industry createdAt applyLink'),
    Job.countDocuments(filter)
  ]);

  res.json({
    jobs,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(pageSize))
  });
}

// Distinct country/industry values currently in the database, to populate
// the filter dropdowns on the jobs browsing page.
export async function getJobFilters(req, res) {
  const [countries, industries] = await Promise.all([
    Job.distinct('country', { status: 'open', country: { $ne: null } }),
    Job.distinct('industry', { status: 'open', industry: { $ne: null } })
  ]);

  res.json({
    countries: countries.sort(),
    industries: industries.sort()
  });
}
