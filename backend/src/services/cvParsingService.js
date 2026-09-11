import { callAIForJSON } from './aiService.js';

// cvText can come from an uploaded file (already extracted to plain text)
// or directly from a "type it in" form — same parsing logic either way.
export async function parseCvText(cvText) {
  const prompt = `Extract structured data from this CV/resume text.

CV text:
"""
${cvText}
"""

Return JSON with this exact shape:
{
  "skills": ["skill1", "skill2", ...],
  "parsedExperienceYears": <number, your best estimate of total years of professional experience>
}`;

  const result = await callAIForJSON(prompt);

  return {
    skills: result.skills || [],
    parsedExperienceYears: result.parsedExperienceYears || 0,
    rawParsedText: cvText
  };
}
