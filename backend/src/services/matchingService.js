import Job from '../models/Job.js';
import Application from '../models/Application.js';

import {
  generateUserEmbedding,
  getEmbeddingDimensions
} from './embeddingService.js';


// --------------------------------------------------
// GET / CREATE USER CV EMBEDDING
// --------------------------------------------------

async function getUserEmbedding(user) {
  const currentProfile =
    user.skillsProfile || {};

  const hasProfile =
    Array.isArray(
      currentProfile.skills
    ) &&
    currentProfile.skills.length > 0;

  const hasCvText =
    Boolean(
      currentProfile.rawParsedText
    );

  if (
    !hasProfile &&
    !hasCvText
  ) {
    return null;
  }

  const expectedDimensions =
    getEmbeddingDimensions();

  // ------------------------------------------------
  // USE CACHED VECTOR WHEN POSSIBLE
  // ------------------------------------------------

  if (
    Array.isArray(
      user.matchingEmbedding
    ) &&
    user.matchingEmbedding.length ===
      expectedDimensions &&
    user.matchingEmbeddingHash
  ) {
    return user.matchingEmbedding;
  }

  // ------------------------------------------------
  // GENERATE NEW GEMINI EMBEDDING
  // ------------------------------------------------

  const result =
    await generateUserEmbedding(
      user
    );

  if (
    !result?.embedding ||
    !Array.isArray(
      result.embedding
    )
  ) {
    return null;
  }

  if (
    result.embedding.length !==
    expectedDimensions
  ) {
    throw new Error(
      `User embedding dimension mismatch. Expected ${expectedDimensions}, received ${result.embedding.length}.`
    );
  }

  user.matchingEmbedding =
    result.embedding;

  user.matchingEmbeddingHash =
    result.embeddingHash;

  user.matchingEmbeddingUpdatedAt =
    new Date();

  await user.save();

  return result.embedding;
}


// --------------------------------------------------
// EXACT SKILL SCORE
// --------------------------------------------------

function calculateSkillScore(
  userSkills,
  jobSkills
) {
  if (
    !Array.isArray(jobSkills) ||
    jobSkills.length === 0
  ) {
    return 0;
  }

  if (
    !Array.isArray(userSkills) ||
    userSkills.length === 0
  ) {
    return 0;
  }

  const normalizedUserSkills =
    new Set(
      userSkills.map(
        (skill) =>
          String(skill)
            .toLowerCase()
            .trim()
      )
    );

  const normalizedJobSkills =
    jobSkills
      .map(
        (skill) =>
          String(skill)
            .toLowerCase()
            .trim()
      )
      .filter(Boolean);

  if (
    normalizedJobSkills.length === 0
  ) {
    return 0;
  }

  const overlap =
    normalizedJobSkills.filter(
      (skill) =>
        normalizedUserSkills.has(
          skill
        )
    );

  return (
    overlap.length /
    normalizedJobSkills.length
  );
}


// --------------------------------------------------
// FALLBACK SKILL MATCHING
// --------------------------------------------------

async function fallbackSkillMatches(
  user,
  appliedJobIds,
  limit
) {
  const userSkills =
    (
      user.skillsProfile
        ?.skills ||
      []
    )
      .map(
        (skill) =>
          String(skill)
            .toLowerCase()
            .trim()
      )
      .filter(Boolean);

  if (
    userSkills.length === 0
  ) {
    return [];
  }

  const jobs =
    await Job.find({
      status: 'open',

      _id: {
        $nin: [
          ...appliedJobIds
        ]
      },

      skillsExtracted: {
        $in: userSkills
      }
    })
      .select(
        [
          'title',
          'company',
          'location',
          'country',
          'industry',
          'applyLink',
          'skillsExtracted',
          'createdAt'
        ].join(' ')
      )
      .lean();

  return jobs
    .map((job) => {
      const jobSkills =
        (
          job.skillsExtracted ||
          []
        )
          .map(
            (skill) =>
              String(skill)
                .toLowerCase()
                .trim()
          )
          .filter(Boolean);

      const score =
        calculateSkillScore(
          userSkills,
          jobSkills
        ) * 100;

      return {
        job,
        score
      };
    })
    .sort(
      (a, b) => {
        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }

        return (
          new Date(
            b.job.createdAt || 0
          ) -
          new Date(
            a.job.createdAt || 0
          )
        );
      }
    )
    .slice(0, limit)
    .map(
      ({
        job,
        score
      }) => ({
        _id: job._id,
        title: job.title,
        company: job.company,
        location: job.location,
        country: job.country,
        industry: job.industry,
        applyLink: job.applyLink,
        matchScore:
          Math.round(score)
      })
    );
}


// --------------------------------------------------
// MAIN MATCHING FUNCTION
// --------------------------------------------------

export async function findMatchesForUser(
  user,
  limit = 20
) {
  const userSkills =
    (
      user.skillsProfile
        ?.skills ||
      []
    )
      .map(
        (skill) =>
          String(skill)
            .toLowerCase()
            .trim()
      )
      .filter(Boolean);

  const hasCv =
    Boolean(
      user.skillsProfile
        ?.rawParsedText
    );

  if (
    userSkills.length === 0 &&
    !hasCv
  ) {
    return [];
  }


  // ------------------------------------------------
  // FIND JOBS USER ALREADY APPLIED FOR
  // ------------------------------------------------

  const existingApplications =
    await Application.find({
      user: user._id
    })
      .select('job')
      .lean();

  const appliedJobIds =
    new Set(
      existingApplications
        .filter(
          (application) =>
            application.job
        )
        .map(
          (application) =>
            String(
              application.job
            )
        )
    );


  // ------------------------------------------------
  // CREATE / LOAD USER CV VECTOR
  // ------------------------------------------------

  let userEmbedding;

  try {
    userEmbedding =
      await getUserEmbedding(
        user
      );
  } catch (error) {
    console.error(
      '[matching] failed to generate user embedding:',
      error.message
    );

    return fallbackSkillMatches(
      user,
      appliedJobIds,
      limit
    );
  }

  if (!userEmbedding) {
    return fallbackSkillMatches(
      user,
      appliedJobIds,
      limit
    );
  }


  // ------------------------------------------------
  // VECTOR SEARCH CONFIGURATION
  // ------------------------------------------------

  const vectorResultLimit =
    Math.max(
      Number(
        process.env
          .JOB_VECTOR_RESULTS ||
          200
      ),
      limit * 5
    );

  const numCandidates =
    Math.max(
      Number(
        process.env
          .JOB_VECTOR_CANDIDATES ||
          1000
      ),
      vectorResultLimit
    );


  // ------------------------------------------------
  // MONGODB ATLAS VECTOR SEARCH
  // ------------------------------------------------

  let candidates;

  try {
    candidates =
      await Job.aggregate([
        {
          $vectorSearch: {
            index:
              process.env
                .JOB_VECTOR_INDEX_NAME ||
              'job_embedding_index',

            path:
              'embedding',

            queryVector:
              userEmbedding,

            numCandidates,

            limit:
              vectorResultLimit,

            filter: {
              status: 'open'
            }
          }
        },

        {
          $project: {
            title: 1,
            company: 1,
            location: 1,
            country: 1,
            industry: 1,
            applyLink: 1,
            skillsExtracted: 1,
            createdAt: 1,

            semanticScore: {
              $meta:
                'vectorSearchScore'
            }
          }
        }
      ]);

  } catch (error) {
    console.error(
      '[matching] vector search unavailable:',
      error.message
    );

    return fallbackSkillMatches(
      user,
      appliedJobIds,
      limit
    );
  }


  // ------------------------------------------------
  // HYBRID RANKING
  // ------------------------------------------------

  const ranked =
    candidates
      // Remove jobs already applied for.
      .filter(
        (job) =>
          !appliedJobIds.has(
            String(
              job._id
            )
          )
      )

      .map(
        (job) => {
          const jobSkills =
            (
              job.skillsExtracted ||
              []
            )
              .map(
                (skill) =>
                  String(skill)
                    .toLowerCase()
                    .trim()
              )
              .filter(Boolean);

          const skillScore =
            calculateSkillScore(
              userSkills,
              jobSkills
            );

          const semanticScore =
            Math.min(
              Math.max(
                Number(
                  job.semanticScore ||
                    0
                ),
                0
              ),
              1
            );

          // 85% semantic similarity
          // 15% exact skill overlap
          const finalScore =
            semanticScore * 0.85 +
            skillScore * 0.15;

          return {
            job,
            finalScore
          };
        }
      )

      .sort(
        (a, b) => {
          if (
            b.finalScore !==
            a.finalScore
          ) {
            return (
              b.finalScore -
              a.finalScore
            );
          }

          return (
            new Date(
              b.job.createdAt || 0
            ) -
            new Date(
              a.job.createdAt || 0
            )
          );
        }
      )

      .slice(
        0,
        limit
      );


  // ------------------------------------------------
  // RESPONSE
  // ------------------------------------------------

  return ranked.map(
    ({
      job,
      finalScore
    }) => ({
      _id: job._id,

      title:
        job.title,

      company:
        job.company,

      location:
        job.location,

      country:
        job.country,

      industry:
        job.industry,

      applyLink:
        job.applyLink,

      matchScore:
        Math.round(
          finalScore * 100
        )
    })
  );
}


// --------------------------------------------------
// FIND REPLACEMENT JOB
// --------------------------------------------------

export async function findReplacementForUser(
  user,
  excludeJobIds = []
) {
  const matches =
    await findMatchesForUser(
      user,
      50
    );

  const excluded =
    new Set(
      excludeJobIds.map(
        String
      )
    );

  return (
    matches.find(
      (match) =>
        !excluded.has(
          String(
            match._id
          )
        )
    ) || null
  );
}
