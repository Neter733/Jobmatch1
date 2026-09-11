import axios from 'axios';

// Shared helper so every feature (CV parsing, cover-letter extraction,
// cover-letter generation) calls the AI API the same way. Currently wired
// to Groq (console.groq.com) — genuinely free, no credit card or phone
// verification required, and fast. Runs Llama 3.3 70B rather than a
// Gemini/Claude-class model, but capable enough for structured extraction
// and cover-letter drafting.
//
// Groq's API is OpenAI-compatible, so switching to OpenAI or another
// OpenAI-compatible provider later is a small change, not a rewrite.
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callAI(prompt, { maxTokens = 1500 } = {}) {
  const response = await axios.post(
    GROQ_BASE_URL,
    {
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.choices?.[0]?.message?.content || '';
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
