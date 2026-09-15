```js
import Job from '../models/Job.js';

import {
  generateJobEmbeddings,
  getEmbeddingDimensions
} from './embeddingService.js';


const DEFAULT_BATCH_SIZE =
  Number(
    process.env.EMBEDDING_BATCH_SIZE || 20
  );


// --------------------------------------------------
// FIND JOBS THAT NEED EMBEDDINGS
// --------------------------------------------------

function buildPendingJobQuery() {
  const expectedDimensions =
    getEmbeddingDimensions();

  return {
    status: 'open',

    $or: [
      // No embedding.
      {
        embedding: {
          $exists: false
        }
      },

      // Empty embedding.
      {
        'embedding.0': {
          $exists: false
        }
      },

      // Wrong vector dimension.
      {
        $expr: {
          $ne: [
            {
              $size: {
                $ifNull: [
                  '$embedding',
                  []
                ]
              }
            },
            expectedDimensions
          ]
        }
      },

      // No embedding hash.
      {
        embeddingHash: {
          $exists: false
        }
      },

      // Job content changed after
      // the previous embedding.
      {
        $expr: {
          $ne: [
            '$embeddingSourceHash',
            '$embeddingHash'
          ]
        }
      }
    ]
  };
}


// --------------------------------------------------
// PROCESS ONE BATCH
// --------------------------------------------------

export async function embedPendingJobs(
  batchSize = DEFAULT_BATCH_SIZE
) {
  const safeBatchSize =
    Math.max(
      1,
      Number(batchSize) || 20
    );


  const jobs =
    await Job.find(
      buildPendingJobQuery()
    )
      .sort({
        updatedAt: 1
      })
      .limit(
        safeBatchSize
      )
      .lean();


  if (
    jobs.length === 0
  ) {
    return {
      processed: 0,
      remaining: 0
    };
  }


  console.log(
    `[embedding] Generating embeddings for ${jobs.length} job(s)...`
  );


  // Gemini batch embedding.
  const results =
    await generateJobEmbeddings(
      jobs
    );


  const now =
    new Date();


  const bulkOperations =
    results.map(
      ({
        job,
        embedding,
        embeddingHash
      }) => ({
        updateOne: {
          filter: {
            _id: job._id
          },

          update: {
            $set: {
              embedding,

              // The hash of the exact
              // text used to create the
              // embedding.
              embeddingHash,

              // Keep the source hash synchronized
              // with the content used for this
              // embedding.
              embeddingSourceHash:
                embeddingHash,

              embeddingUpdatedAt:
                now
            }
          }
        }
      })
    );


  if (
    bulkOperations.length > 0
  ) {
    await Job.bulkWrite(
      bulkOperations
    );
  }


  console.log(
    `[embedding] Successfully embedded ${bulkOperations.length} job(s).`
  );


  const remaining =
    await Job.countDocuments(
      buildPendingJobQuery()
    );


  return {
    processed:
      bulkOperations.length,

    remaining
  };
}


// --------------------------------------------------
// MANUAL FULL BACKFILL
// --------------------------------------------------

export async function embedAllPendingJobs(
  batchSize = DEFAULT_BATCH_SIZE
) {
  let totalProcessed = 0;

  while (true) {
    const result =
      await embedPendingJobs(
        batchSize
      );

    totalProcessed +=
      result.processed;

    if (
      result.processed === 0
    ) {
      break;
    }
  }


  console.log(
    `[embedding] Backfill finished. Total processed: ${totalProcessed}`
  );


  return {
    processed:
      totalProcessed
  };
}
```
