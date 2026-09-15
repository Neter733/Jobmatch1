import axios from 'axios';
import crypto from 'crypto';

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

const GEMINI_EMBEDDING_DIMENSIONS = Number(
  process.env.GEMINI_EMBEDDING_DIMENSIONS || 1536
);

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

/**
 * Build the searchable text representation of a job.
 *
 * We deliberately include:
 * - title
 * - company
 * - location
 * - country
 * - industry
 * - extracted skills
 * - description
 *
 * This allows semantic matching to understand the overall job,
 * rather than relying only on exact skill names.
 */
export function buildJobEmbeddingText(job) {
  const skills = Array.isArray(job.skillsExtracted)
    ? job.skillsExtracted.join(', ')
    : '';

  return [
    `Job title: ${cleanText(job.title)}`,
    `Company: ${cleanText(job.company)}`,
    `Location: ${cleanText(job.location)}`,
    `Country: ${cleanText(job.country)}`,
    `Industry: ${cleanText(job.industry)}`,
    `Skills: ${cleanText(skills)}`,
    `Description: ${cleanText(job.description)}`
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build the searchable representation of a user's CV/profile.
 */
export function buildUserEmbeddingText(user) {
  const skills = Array.isArray(user.skillsProfile?.skills)
    ? user.skillsProfile.skills.join(', ')
    : '';

  const experienceYears =
    user.skillsProfile?.parsedExperienceYears || 0;

  const rawCvText =
    user.skillsProfile?.rawParsedText || '';

  return [
    `Skills: ${cleanText(skills)}`,
    `Professional experience: ${experienceYears} years`,
    `CV/resume: ${cleanText(rawCvText)}`
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Gemini Embedding API.
 *
 * We use RETRIEVAL_DOCUMENT for jobs and RETRIEVAL_QUERY for users.
 * This is designed specifically for retrieval/search-style matching.
 */
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
          text
        }
      ]
    },
    taskType,
    outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS
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
            'x-goog-api-key': process.env.GEMINI_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const embeddings = response.data?.embeddings;

      if (!Array.isArray(embeddings)) {
        throw new Error(
          'Gemini returned an unexpected embedding response'
        );
      }

      return embeddings.map((item) => item.values);
    } catch (error) {
      lastError = error;

      const status = error.response?.status;

      const retryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (!retryable || attempt === 4) {
        break;
      }

      const delay = attempt * 2000;

      console.warn(
        `[embedding] Gemini request failed (${status}). Retrying in ${delay}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  const status = lastError?.response?.status;
  const data = lastError?.response?.data;

  console.error(
    '[embedding] Gemini embedding request failed:',
    status,
    data || lastError?.message
  );

  throw lastError;
}

/**
 * Generate one job embedding.
 */
export async function generateJobEmbedding(job) {
  const text = buildJobEmbeddingText(job);

  if (!text.trim()) {
    throw new Error(
      `Cannot generate embedding for job ${job._id}: empty searchable text`
    );
  }

  const [embedding] = await embedTexts(
    [text],
    'RETRIEVAL_DOCUMENT'
  );

  return {
    embedding,
    embeddingHash: hashText(text),
    embeddingText: text
  };
}

/**
 * Generate embeddings for multiple jobs.
 */
export async function generateJobEmbeddings(jobs) {
  if (!jobs?.length) {
    return [];
  }

  const texts = jobs.map(buildJobEmbeddingText);

  const embeddings = await embedTexts(
    texts,
    'RETRIEVAL_DOCUMENT'
  );

  return jobs.map((job, index) => ({
    job,
    embedding: embeddings[index],
    embeddingHash: hashText(texts[index]),
    embeddingText: texts[index]
  }));
}

/**
 * Generate the user's matching embedding.
 */
export async function generateUserEmbedding(user) {
  const text = buildUserEmbeddingText(user);

  if (!text.trim()) {
    throw new Error(
      `Cannot generate embedding for user ${user._id}: empty CV/profile`
    );
  }

  const [embedding] = await embedTexts(
    [text],
    'RETRIEVAL_QUERY'
  );

  return {
    embedding,
    embeddingHash: hashText(text),
    embeddingText: text
  };
}

export function getEmbeddingDimensions() {
  return GEMINI_EMBEDDING_DIMENSIONS;
}
