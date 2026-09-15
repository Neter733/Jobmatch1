import Job from '../models/Job.js';

// Simple overlap-based scoring to start. Upgrade path: replace with
// embeddings (e.g. via the AI API) + cosine similarity for genuine
// semantic matching once volume/quality demands it — MongoDB Atlas
// Vector Search can hold the embeddings if you go that route.
export async function findMatchesForUser(user, limit = 20) {
  const userSkills = (user.skillsProfile?.skills || []).map((s) => s.toLowerCase());

  const openJobs = await Job.find({ status: 'open' }).limit(500);

  const scored = openJobs.map((job) => {
    const jobSkills = job.skillsExtracted.map((s) => s.toLowerCase());
    const overlap = jobSkills.filter((s) => userSkills.includes(s));
    const score = jobSkills.length
      ? Math.round((overlap.length / jobSkills.length) * 100)
      : 0;

    return { job, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ job, score }) => ({
      _id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      applyLink: job.applyLink,
      matchScore: score
    }));
}

// Used by the admin queue's "find replacement job" action when a job closes
export async function findReplacementForUser(user, excludeJobIds = []) {
  const matches = await findMatchesForUser(user, 5);
  return matches.find((m) => !excludeJobIds.includes(String(m._id))) || null;
}
