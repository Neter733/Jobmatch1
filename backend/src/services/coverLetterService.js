import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Generates a tailored cover letter from the user's onboarding questionnaire
// (their master answers to the 3 required questions) + the specific job
// description, then uploads it to Cloudinary as a private/authenticated
// asset and returns the signed URL.
export async function generateCoverLetter(user, job) {
  const { greatestAchievement, skillsAndTools, experienceSummary } =
    user.coverLetterQuestionnaire;

  const prompt = `Write a professional, ~1000-word cover letter for the "${job.title}" role at ${job.company}.
Use the following candidate material — do not invent achievements or experience beyond what's given.

Greatest work achievement: ${greatestAchievement}

Skills, apps, and software used on the job: ${skillsAndTools}

Work experience and years in the field: ${experienceSummary}

Job description to tailor toward: ${job.description}

The letter should emphasize the candidate's skills and achievements that best match this specific job description.`;

  const response = await axios.post(
    `${process.env.AI_API_BASE_URL}/messages`,
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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

  const letterText = response.data.content
    .map((block) => block.text || '')
    .join('\n');

  const upload = await cloudinary.uploader.upload(
    `data:text/plain;base64,${Buffer.from(letterText).toString('base64')}`,
    {
      resource_type: 'raw',
      folder: `cover-letters/${user._id}`,
      public_id: `${job._id}`,
      type: 'authenticated' // private, signed delivery — not public
    }
  );

  return cloudinary.utils.private_download_url(upload.public_id, 'txt', {
    resource_type: 'raw',
    type: 'authenticated'
  });
}
