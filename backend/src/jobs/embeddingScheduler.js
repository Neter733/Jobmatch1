import cron from 'node-cron';

import {
  embedPendingJobs
} from '../services/embeddingBackfillService.js';


async function runEmbeddingBatch() {

  try {

    const result =
      await embedPendingJobs();


    if (result.skipped) {

      console.log(
        `[embedding] skipped — ${result.reason}`
      );

      return;
    }


    if (result.processed > 0) {

      console.log(
        `[embedding] embedded ${result.processed} job(s)`
      );

    }

  } catch (error) {

    console.error(
      '[embedding] batch failed:',
      error.message
    );

  }
}


export function startEmbeddingScheduler() {

  // Start shortly after Railway boots.
  //
  // This means existing jobs start getting
  // backfilled automatically.
  setTimeout(
    () => {
      runEmbeddingBatch();
    },
    10000
  );


  // Every minute:
  //
  // - process old jobs
  // - process newly imported jobs
  // - process changed jobs
  cron.schedule(
    '* * * * *',
    runEmbeddingBatch
  );


  console.log(
    'Embedding scheduler started (every minute)'
  );
}
