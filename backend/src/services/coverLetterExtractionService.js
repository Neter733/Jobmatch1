import { callAIForJSON } from './aiService.js';

// Used when a user uploads an existing cover letter instead of typing the
// 3 answers directly. The AI extracts its best attempt at each answer;
// the user then edits/expands them in the UI to make sure the total hits
// the required 1000-word count.
export async function extractQuestionnaireFromCoverLetter(coverLetterText) {
  const prompt = `Read this cover letter and extract the candidate's answers to these 3 questions,
based only on what's actually in the text. If the letter doesn't fully cover a
question, extract what's there and leave the rest for the candidate to fill in — do not invent details.

1. What is their greatest work achievement, and what did they do?
2. What skills, apps, and software can they use, and how have they used them in their job?
3. More detail on their work experience and how long they've been in the field/industry.

Cover letter text:
"""
${coverLetterText}
"""

Return JSON with this exact shape:
{
  "greatestAchievement": "...",
  "skillsAndTools": "...",
  "experienceSummary": "..."
}`;

  return callAIForJSON(prompt, { maxTokens: 2000 });
}
