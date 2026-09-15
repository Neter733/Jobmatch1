```js
import mongoose from 'mongoose';
import crypto from 'crypto';


// --------------------------------------------------
// HASH HELPERS
// --------------------------------------------------

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}


function buildSemanticText(
  data = {}
) {
  const skills =
    Array.isArray(
      data.skillsExtracted
    )
      ? data.skillsExtracted
          .map(
            normalizeText
          )
          .filter(Boolean)
          .join(', ')
      : '';

  return [
    `Title: ${normalizeText(data.title)}`,
    `Company: ${normalizeText(data.company)}`,
    `Location: ${normalizeText(data.location)}`,
    `Country: ${normalizeText(data.country)}`,
    `Industry: ${normalizeText(data.industry)}`,
    `Skills: ${skills}`,
    `Description: ${normalizeText(data.description)}`
  ].join('\n');
}


function hashSemanticData(
  data = {}
) {
  return crypto
    .createHash('sha256')
    .update(
      buildSemanticText(data)
    )
    .digest('hex');
}


// --------------------------------------------------
// JOB SCHEMA
// --------------------------------------------------

const jobSchema =
  new mongoose.Schema(
    {
      source: {
        type: String,
        default: 'jobo'
      },

      externalId: {
        type: String,
        required: true
      },

      title: {
        type: String,
        required: true
      },

      company: String,

      location: String,

      country: String,

      industry: String,

      description: String,

      applyLink: {
        type: String,
        required: true
      },

      skillsExtracted: [
        String
      ],


      // ------------------------------------------------
      // SEMANTIC MATCHING
      // ------------------------------------------------

      embedding: {
        type: [Number],
        default: undefined
      },

      // Hash representing the CURRENT
      // searchable job content.
      embeddingSourceHash: {
        type: String,
        default: null
      },

      // Hash representing the content
      // used to create the stored vector.
      embeddingHash: {
        type: String,
        default: null
      },

      embeddingUpdatedAt:
        Date,


      status: {
        type: String,

        enum: [
          'open',
          'closed'
        ],

        default: 'open'
      },

      rawData:
        mongoose.Schema.Types.Mixed
    },

    {
      timestamps: true
    }
  );


// --------------------------------------------------
// AUTOMATIC EMBEDDING CHANGE DETECTION
// --------------------------------------------------
//
// Job ingestion uses findOneAndUpdate().
//
// We fetch the existing job, merge its existing
// searchable fields with the incoming update, then
// calculate the hash of the COMPLETE resulting job.
//
// This does NOT call Gemini.
//
// It only calculates a cheap SHA-256 hash.
// --------------------------------------------------

jobSchema.pre(
  'findOneAndUpdate',
  async function (next) {
    try {
      const update =
        this.getUpdate() || {};

      const setData =
        update.$set || {};

      const query =
        this.getQuery() || {};

      // Find the existing job.
      //
      // This is a normal findOne(), so this
      // middleware does not recursively trigger.
      const existing =
        await this.model
          .findOne(query)
          .lean();

      const existingData =
        existing || {};

      // Merge existing document with
      // incoming update.
      const mergedData = {
        ...existingData,
        ...update,
        ...setData
      };

      const semanticFields = [
        'title',
        'company',
        'location',
        'country',
        'industry',
        'description',
        'skillsExtracted'
      ];

      const hasSemanticContent =
        semanticFields.some(
          (field) =>
            Object.prototype.hasOwnProperty.call(
              mergedData,
              field
            )
        );

      if (
        hasSemanticContent
      ) {
        const hash =
          hashSemanticData(
            mergedData
          );

        if (
          update.$set
        ) {
          update.$set =
            {
              ...update.$set,

              embeddingSourceHash:
                hash
            };
        } else {
          update.embeddingSourceHash =
            hash;
        }

        this.setUpdate(
          update
        );
      }

      next();

    } catch (error) {
      next(error);
    }
  }
);


// --------------------------------------------------
// INDEXES
// --------------------------------------------------

jobSchema.index(
  {
    source: 1,
    externalId: 1
  },
  {
    unique: true
  }
);


// Existing keyword search.
jobSchema.index({
  title: 'text',
  company: 'text',
  description: 'text'
});


// Fallback skill matching.
jobSchema.index({
  status: 1,
  skillsExtracted: 1
});


// Locate jobs requiring embeddings.
jobSchema.index({
  status: 1,
  embeddingHash: 1,
  embeddingSourceHash: 1
});


export default mongoose.model(
  'Job',
  jobSchema
);
```
