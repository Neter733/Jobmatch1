import Job from '../models/Job.js';

import {
  buildJobEmbeddingText,
  generateEmbeddings,
  hashText
} from './embeddingService.js';


let workerRunning = false;


// --------------------------------------------------
// EMBED JOBS THAT NEED EMBEDDINGS
// --------------------------------------------------

export async function embedPendingJobs(
  batchSize =
    Number(
      process.env.EMBEDDING_BATCH_SIZE ||
      20
    )
) {

  // Prevent two workers from running
  // simultaneously on one server instance.
  if (workerRunning) {
    return {
      skipped: true,
      reason:
        'embedding worker already running'
    };
  }


  if (!process.env.OPENAI_API_KEY) {
    return {
      skipped: true,
      reason:
        'OPENAI_API_KEY is not configured'
    };
  }


  workerRunning = true;


  try {

    // ------------------------------------------------
    // FIND JOBS NEEDING AN EMBEDDING
    // ------------------------------------------------
    //
    // This includes:
    //
    // 1. old jobs that existed before this feature
    //
    // 2. newly imported jobs
    //
    // 3. jobs whose title/description/skills changed
    //
    // ------------------------------------------------

    const jobs =
      await Job.find({

        status: 'open',

        $or: [

          {
            embedding: {
              $exists: false
            }
          },

          {
            embeddingSourceHash: {
              $exists: false
            }
          },

          {
            embeddingSourceHash: null
          },

          {
            $expr: {
              $ne: [
                '$embeddingHash',
                '$embeddingSourceHash'
              ]
            }
          }

        ]

      })

      // Old jobs first during initial migration.
      .sort({
        createdAt: 1
      })

      .limit(batchSize)

      .select(
        [
          'title',
          'company',
          'location',
          'country',
          'industry',
          'description',
          'skillsExtracted',
          'embeddingSourceHash'
        ].join(' ')
      )

      .lean();


    if (!jobs.length) {

      return {
        processed: 0
      };
    }


    // ------------------------------------------------
    // CREATE TEXT FOR EACH JOB
    // ------------------------------------------------

    const texts =
      jobs.map(
        buildJobEmbeddingText
      );


    // Existing jobs don't have
    // embeddingSourceHash yet.
    //
    // Generate one during migration.
    const sourceHashes =
      jobs.map(
        (job, index) =>

          job.embeddingSourceHash ||

          hashText(
            texts[index]
          )
      );


    // ------------------------------------------------
    // GENERATE ALL EMBEDDINGS IN ONE REQUEST
    // ------------------------------------------------

    const embeddings =
      await generateEmbeddings(
        texts
      );


    // ------------------------------------------------
    // SAVE RESULTS USING BULKWRITE
    // ------------------------------------------------

    const operations =
      jobs.map(
        (job, index) => {

          const filter = {

            _id: job._id,

            status: 'open'
          };


          // If this was already a newer job with
          // a source hash, make sure it did not
          // change while OpenAI was processing it.
          if (
            job.embeddingSourceHash
          ) {

            filter.embeddingSourceHash =
              job.embeddingSourceHash;

          } else {

            filter.$or = [

              {
                embeddingSourceHash: {
                  $exists: false
                }
              },

              {
                embeddingSourceHash:
                  null
              }

            ];
          }


          return {

            updateOne: {

              filter,

              update: {

                $set: {

                  embedding:
                    embeddings[index],

                  embeddingSourceHash:
                    sourceHashes[index],

                  embeddingHash:
                    sourceHashes[index],

                  embeddingUpdatedAt:
                    new Date()
                }

              }

            }

          };

        }
      );


    const result =
      await Job.bulkWrite(
        operations,
        {
          ordered: false
        }
      );


    return {

      processed:
        result.modifiedCount,

      requested:
        jobs.length

    };


  } finally {

    workerRunning = false;

  }
}
