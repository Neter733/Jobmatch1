import { extractTextFromFile } from '../services/fileTextExtractionService.js';
import { parseCvText } from '../services/cvParsingService.js';
import { extractQuestionnaireFromCoverLetter } from '../services/coverLetterExtractionService.js';
import { uploadPrivateFile } from '../services/fileStorageService.js';

const REQUIRED_WORD_COUNT = 1000;
const MIN_WORDS_PER_QUESTION = 250; // prevents one answer padding out the total while others are thin

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// --- CV: upload path ---
export async function uploadCv(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const cvText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
  const cvUrl = await uploadPrivateFile(req.file.buffer, `cvs/${req.user._id}`, 'cv');
  const skillsProfile = await parseCvText(cvText);

  req.user.cvUrl = cvUrl;
  req.user.skillsProfile = skillsProfile;
  await req.user.save();

  res.json({ cvUrl, skillsProfile });
}

// --- CV: typed path ---
export async function submitTypedCv(req, res) {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'CV text is required' });

  const skillsProfile = await parseCvText(text);

  req.user.cvUrl = null; // no file — the parsed text itself is the record
  req.user.skillsProfile = skillsProfile;
  await req.user.save();

  res.json({ skillsProfile });
}

// --- Cover letter: upload path ---
// Extracts answers to the 3 required questions for the user to review/edit —
// does NOT save the questionnaire yet, since it may be under the word count
// or need edits first.
export async function extractCoverLetterFromUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const coverLetterText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
  const extracted = await extractQuestionnaireFromCoverLetter(coverLetterText);

  res.json({
    greatestAchievement: extracted.greatestAchievement || '',
    skillsAndTools: extracted.skillsAndTools || '',
    experienceSummary: extracted.experienceSummary || '',
    wordCount: countWords(
      `${extracted.greatestAchievement || ''} ${extracted.skillsAndTools || ''} ${extracted.experienceSummary || ''}`
    )
  });
}

// --- Cover letter: save path (used for both typed-from-scratch AND
// edited-after-upload-extraction — same shape either way) ---
export async function saveCoverLetterQuestionnaire(req, res) {
  const { greatestAchievement, skillsAndTools, experienceSummary } = req.body;

  const questionCounts = {
    greatestAchievement: countWords(greatestAchievement || ''),
    skillsAndTools: countWords(skillsAndTools || ''),
    experienceSummary: countWords(experienceSummary || '')
  };

  const thinAnswers = Object.entries(questionCounts)
    .filter(([, count]) => count < MIN_WORDS_PER_QUESTION)
    .map(([key]) => key);

  if (thinAnswers.length) {
    return res.status(400).json({
      error: `Each answer needs at least ${MIN_WORDS_PER_QUESTION} words. Too short: ${thinAnswers.join(', ')}.`,
      questionCounts
    });
  }

  const wordCount = questionCounts.greatestAchievement + questionCounts.skillsAndTools + questionCounts.experienceSummary;

  if (wordCount < REQUIRED_WORD_COUNT) {
    return res.status(400).json({
      error: `Answers must total at least ${REQUIRED_WORD_COUNT} words (currently ${wordCount}).`,
      questionCounts
    });
  }

  req.user.coverLetterQuestionnaire = {
    greatestAchievement,
    skillsAndTools,
    experienceSummary,
    wordCount
  };
  await req.user.save();

  res.json({ success: true, wordCount });
}
