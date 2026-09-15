import Job from '../models/Job.js';
import {
  generateJobEmbeddings
} from './embeddingService.js';

const DEFAULT_BATCH_SIZE = Number(
  process.env.EMBEDDING_BATCH_SIZE || 20
);

/**
 * Find jobs that still need embeddings and generate them in batches.
 *
 * A job needs an embedding when:
 * - it has no embedding
 * - its embedding is not the expected dimension
 * - its source content changed since the previous embedding
 * - it has no embedding hash
 */
export async function embedPendingJobs(
  batchSize = DEFAULT_BATCH_SIZE
) {
  const jobs = await Job.find({
    status: 'open',
    $or: [
      {
        embedding: {
          $exists: false
        }
      },
      {
        'embedding.0': {
          $exists: false
        }
      },
      {
        embeddingHash: {
          $exists: false
        }
      },
      {
        $expr: {
          $ne: [
            '$embeddingSourceHash',
            '$embeddingHash'
          ]
        }
      }
    ]
  })
    .sort({ updatedAt: 1 })
    .limit(batchSize)
    .lean();

  if (!jobs.length) {
    return {
      processed: 0,
      remaining: 0
    };
  }

  console.log(
    `[embedding] Generating embeddings for ${jobs.length} jobs...`
  );

  const results = await generateJobEmbeddings(jobs);

  const bulkOperations = results.map(
    ({ job, embedding, embeddingHash }) => ({
      updateOne: {
        filter: {
          _id: job._id
        },
        update: {
          $set: {
            embedding,
            embeddingHash,
            embeddingUpdatedAt: new Date()
          }
        }
      }
    })
  );

  if (bulkOperations.length) {
    await Job.bulkWrite(bulkOperations);
  }

  console.log(
    `[embedding] Successfully embedded ${bulkOperations.length} jobs.`
  );

  const remaining = await Job.countDocuments({
    status: 'open',
    $or: [
      {
        embedding: {
          $exists: false
        }
      },
      {
        'embedding.0': {
          $exists: false
        }
      },
      {
        embeddingHash: {
          $exists: false
        }
      },
      {
        $expr: {
          $ne: [
            '$embeddingSourceHash',
            '$embeddingHash'
          ]
        }
      }
    ]
  });

  return {
    processed: bulkOperations.length,
    remaining
  };
}

/**
 * Keep processing batches until there are no more jobs that need
 * embeddings.
 *
 * This function is available for manual/backfill use.
 */
export async function embedAllPendingJobs(
  batchSize = DEFAULT_BATCH_SIZE
) {
  let totalProcessed = 0;

  while (true) {
    const result = await embedPendingJobs(batchSize);

    totalProcessed += result.processed;

    if (result.processed === 0) {
      break;
    }
  }

  console.log(
    `[embedding] Backfill finished. Total processed: ${totalProcessed}`
  );

  return {
    processed: totalProcessed
  };
}
