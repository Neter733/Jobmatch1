```js
import axios from 'axios';
import crypto from 'crypto';

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

const GEMINI_EMBEDDING_DIMENSIONS = Number(
  process.env.GEMINI_EMBEDDING_DIMENSIONS || 1536
);

// Gemini embedding-001 has a 2048-token input limit.
// We keep the text comfortably below that limit.
const MAX_TEXT_LENGTH = 7000;


// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function requireGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
}

function hashText(text) {
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('hex');
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, maxLength = MAX_TEXT_LENGTH) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}


// --------------------------------------------------
// JOB EMBEDDING TEXT
// --------------------------------------------------

export function buildJobEmbeddingText(job) {
  const skills = Array.isArray(job.skillsExtracted)
    ? job.skillsExtracted
        .map(cleanText)
        .filter(Boolean)
        .join(', ')
    : '';

  const title = cleanText(job.title);
  const company = cleanText(job.company);
  const location = cleanText(job.location);
  const country = cleanText(job.country);
  const industry = cleanText(job.industry);
  const description = truncateText(job.description);

  return [
    title ? `Job title: ${title}` : '',
    company ? `Company: ${company}` : '',
    location ? `Location: ${location}` : '',
    country ? `Country: ${country}` : '',
    industry ? `Industry: ${industry}` : '',
    skills ? `Skills: ${skills}` : '',
    description ? `Description: ${description}` : ''
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_LENGTH);
}


// --------------------------------------------------
// USER / CV EMBEDDING TEXT
// --------------------------------------------------

export function buildUserEmbeddingText(user) {
  const skills = Array.isArray(user.skillsProfile?.skills)
    ? user.skillsProfile.skills
        .map(cleanText)
        .filter(Boolean)
        .join(', ')
    : '';

  const experienceYears =
    Number(user.skillsProfile?.parsedExperienceYears || 0);

  const rawCvText =
    truncateText(
      user.skillsProfile?.rawParsedText || '',
      6000
    );

  return [
    skills ? `Skills: ${skills}` : '',
    `Professional experience: ${experienceYears} years`,
    rawCvText ? `CV/resume: ${rawCvText}` : ''
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_LENGTH);
}


// --------------------------------------------------
// GEMINI EMBEDDING REQUEST
// --------------------------------------------------

async function embedTexts(texts, taskType) {
  requireGeminiKey();

  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const url =
    `${GEMINI_BASE_URL}/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;

  const requests = texts.map((text) => ({
    model: `models/${GEMINI_EMBEDDING_MODEL}`,

    content: {
      parts: [
        {
          text: truncateText(text)
        }
      ]
    },

    taskType,

    outputDimensionality:
      GEMINI_EMBEDDING_DIMENSIONS
  }));

  let lastError;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await axios.post(
        url,
        {
          requests
        },
        {
          headers: {
            'x-goog-api-key':
              process.env.GEMINI_API_KEY,

            'Content-Type':
              'application/json'
          },

          timeout: 60000
        }
      );

      const embeddings =
        response.data?.embeddings;

      if (!Array.isArray(embeddings)) {
        throw new Error(
          'Gemini returned an unexpected embedding response'
        );
      }

      const vectors =
        embeddings.map(
          (item) => item.values
        );

      // Make sure every returned vector has
      // the dimension configured for MongoDB.
      for (const vector of vectors) {
        if (
          !Array.isArray(vector) ||
          vector.length !==
            GEMINI_EMBEDDING_DIMENSIONS
        ) {
          throw new Error(
            `Gemini returned an embedding with an unexpected dimension. Expected ${GEMINI_EMBEDDING_DIMENSIONS}.`
          );
        }
      }

      return vectors;

    } catch (error) {
      lastError = error;

      const status =
        error.response?.status;

      const retryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (
        !retryable ||
        attempt === 4
      ) {
        break;
      }

      const delay =
        attempt * 2000;

      console.warn(
        `[embedding] Gemini request failed (${status}). Retrying in ${delay}ms...`
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            delay
          )
      );
    }
  }

  const status =
    lastError?.response?.status;

  const data =
    lastError?.response?.data;

  console.error(
    '[embedding] Gemini embedding request failed:',
    status,
    data ||
      lastError?.message
  );

  throw lastError;
}


// --------------------------------------------------
// SINGLE JOB EMBEDDING
// --------------------------------------------------

export async function generateJobEmbedding(job) {
  const text =
    buildJobEmbeddingText(job);

  if (!text.trim()) {
    throw new Error(
      `Cannot generate embedding for job ${job._id}: empty searchable text`
    );
  }

  const [embedding] =
    await embedTexts(
      [text],
      'RETRIEVAL_DOCUMENT'
    );

  return {
    embedding,

    embeddingHash:
      hashText(text),

    embeddingText:
      text
  };
}


// --------------------------------------------------
// BATCH JOB EMBEDDINGS
// --------------------------------------------------

export async function generateJobEmbeddings(
  jobs
) {
  if (!jobs?.length) {
    return [];
  }

  const texts =
    jobs.map(
      buildJobEmbeddingText
    );

  const embeddings =
    await embedTexts(
      texts,
      'RETRIEVAL_DOCUMENT'
    );

  return jobs.map(
    (job, index) => ({
      job,

      embedding:
        embeddings[index],

      embeddingHash:
        hashText(
          texts[index]
        ),

      embeddingText:
        texts[index]
    })
  );
}


// --------------------------------------------------
// USER / CV EMBEDDING
// --------------------------------------------------

export async function generateUserEmbedding(
  user
) {
  const text =
    buildUserEmbeddingText(
      user
    );

  if (!text.trim()) {
    throw new Error(
      `Cannot generate embedding for user ${user._id}: empty CV/profile`
    );
  }

  const [embedding] =
    await embedTexts(
      [text],
      'RETRIEVAL_QUERY'
    );

  return {
    embedding,

    embeddingHash:
      hashText(text),

    embeddingText:
      text
  };
}


// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

export function getEmbeddingDimensions() {
  return GEMINI_EMBEDDING_DIMENSIONS;
}
```
