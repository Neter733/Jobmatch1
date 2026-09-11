import axios from 'axios';

// Shared helper so every feature (CV parsing, cover-letter extraction,
// cover-letter generation) calls the AI API the same way. Currently wired
// to Google's Gemini API (aistudio.google.com) since it has a genuinely
// free tier with no credit card required — good for getting the platform
// fully working before committing to a paid provider.
//
// NOTE: on Gemini's free tier, Google may use request data to improve
// their models. Since this app handles real CVs and personal work
// history, switch to a paid tier (which disables training) or a
// no-training provider before handling real users' documents at scale.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function callAI(prompt, { maxTokens = 1500 } = {}) {
  const response = await axios.post(
    GEMINI_BASE_URL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    },
    {
      headers: {
        'x-goog-api-key': process.env.AI_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  const candidate = response.data.candidates?.[0];
  return candidate?.content?.parts?.map((p) => p.text || '').join('\n') || '';
}

// Asks the model for JSON only, strips code-fence wrapping if present,
// and parses it. Used for structured extraction (skills, questionnaire answers).
export async function callAIForJSON(prompt, options) {
  const raw = await callAI(
    `${prompt}\n\nRespond with ONLY valid JSON, no preamble, no markdown code fences.`,
    options
  );
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
