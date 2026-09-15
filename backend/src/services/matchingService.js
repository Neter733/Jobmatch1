import Job from '../models/Job.js';
import Application from '../models/Application.js';

import {
  buildUserEmbeddingText,
  generateEmbedding,
  hashText
} from './embeddingService.js';


// --------------------------------------------------
// GET / CREATE USER CV EMBEDDING
// --------------------------------------------------

async function getUserEmbedding(user) {

  const text =
    buildUserEmbeddingText(
      user
    );


  if (!text) {
    return null;
  }


  const currentHash =
    hashText(text);


  // ------------------------------------------------
  // USE CACHED VECTOR
  // ------------------------------------------------

  if (

    Array.isArray(
      user.matchingEmbedding
    ) &&

    user.matchingEmbedding.length > 0 &&

    user.matchingEmbeddingHash ===
      currentHash

  ) {

    return user.matchingEmbedding;

  }


  // ------------------------------------------------
  // CV CHANGED OR FIRST MATCH
  // ------------------------------------------------

  const embedding =
    await generateEmbedding(
      text
    );


  if (!embedding) {
    return null;
  }


  user.matchingEmbedding =
    embedding;

  user.matchingEmbeddingHash =
    currentHash;

  user.matchingEmbeddingUpdatedAt =
    new Date();


  await user.save();


  return embedding;
}


// --------------------------------------------------
// EXACT SKILL SCORE
// --------------------------------------------------

function calculateSkillScore(
  userSkills,
  jobSkills
) {

  if (!jobSkills.length) {
    return 0;
  }


  const overlap =
    jobSkills.filter(
      (skill) =>
        userSkills.includes(
          skill
        )
    );


  return (
    overlap.length /
    jobSkills.length
  );
}


// --------------------------------------------------
// FALLBACK
// --------------------------------------------------
//
// This only runs if Atlas Vector Search has not
// been configured correctly.
//
// MongoDB itself searches the complete collection.
//
// Node does NOT load every job into memory.
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


  if (!userSkills.length) {
    return [];
  }


  const jobs =
    await Job.find({

      status: 'open',

      skillsExtracted: {
        $in: userSkills
      },

      _id: {
        $nin: [
          ...appliedJobIds
        ]
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


        return {

          job,

          score:

            calculateSkillScore(
              userSkills,
              jobSkills
            ) * 100

        };

      }
    )

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
            b.job.createdAt ||
            0
          ) -

          new Date(
            a.job.createdAt ||
            0
          )
        );

      }
    )

    .slice(
      0,
      limit
    )

    .map(
      ({
        job,
        score
      }) => ({

        _id:
          job._id,

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


  if (
    !userSkills.length &&
    !user.skillsProfile
      ?.rawParsedText
  ) {

    return [];

  }


  // ------------------------------------------------
  // FIND JOBS USER ALREADY PAID/APPLIED FOR
  // ------------------------------------------------

  const existingApplications =
    await Application.find({

      user:
        user._id

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
  // CREATE / LOAD CV VECTOR
  // ------------------------------------------------

  const userEmbedding =
    await getUserEmbedding(
      user
    );


  if (!userEmbedding) {
    return [];
  }


  // MongoDB first returns a larger candidate pool.
  //
  // We then perform hybrid ranking and return 20.
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


  let candidates;


  try {

    // ------------------------------------------------
    // SEMANTIC SEARCH
    // ------------------------------------------------

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

      // Remove jobs this user already applied to.
      .filter(
        (job) =>
          !appliedJobIds.has(
            String(job._id)
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


          // ------------------------------------------
          // FINAL MATCH SCORE
          // ------------------------------------------
          //
          // 85% semantic understanding
          //
          // 15% explicit skills overlap
          // ------------------------------------------

          const finalScore =

            semanticScore *
            0.85

            +

            skillScore *
            0.15;


          return {
            job,
            finalScore
          };

        }
      )


      // Highest score first.
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


          // If scores tie,
          // newest job wins.
          return (

            new Date(
              b.job.createdAt ||
              0
            )

            -

            new Date(
              a.job.createdAt ||
              0
            )

          );

        }
      )


      // User still sees only 20.
      .slice(
        0,
        limit
      );


  return ranked.map(
    ({
      job,
      finalScore
    }) => ({

      _id:
        job._id,

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
          finalScore *
          100
        )

    })
  );
}


// --------------------------------------------------
// REPLACEMENT JOB
// --------------------------------------------------

export async function findReplacementForUser(
  user,
  excludeJobIds = []
) {

  // Search more than 5 here because a number of
  // returned jobs may already be excluded.
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
    )

    ||

    null

  );
}
