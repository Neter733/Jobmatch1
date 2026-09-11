import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String }, // null if signed up via Google
    googleId: { type: String },

    currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },

    cvUrl: { type: String }, // Cloudinary signed URL
    skillsProfile: {
      skills: [String],
      parsedExperienceYears: Number,
      rawParsedText: String // raw AI-parsed CV text, used by matchingService
    },

    // Mandatory 1000-word onboarding questionnaire feeding cover letter generation
    coverLetterQuestionnaire: {
      greatestAchievement: { type: String, default: '' },
      skillsAndTools: { type: String, default: '' },
      experienceSummary: { type: String, default: '' },
      wordCount: { type: Number, default: 0 }
    },

    isAdmin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
