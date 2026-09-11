import axios from 'axios';

// Shared helper so every feature (CV parsing, cover-letter extraction,
// cover-letter generation) calls the AI API the same way.
export async function callAI(prompt, { maxTokens = 1500 } = {}) {
  const response = await axios.post(
    `${process.env.AI_API_BASE_URL}/messages`,
    {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        'x-api-key': process.env.AI_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.content.map((block) => block.text || '').join('\n');
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
