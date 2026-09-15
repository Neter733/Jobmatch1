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

    // 'user' = regular customer. 'staff'/'manager'/'admin' = internal team.
    // isAdmin is kept for backward compatibility with existing admin
    // auth checks, but role is the source of truth going forward.
    role: { type: String, enum: ['user', 'staff', 'manager', 'admin'], default: 'user' },
    isAdmin: { type: Boolean, default: false },

    // For staff/manager/admin: updated on every heartbeat while their
    // dashboard tab is open, used to show "online" status to managers.
    lastActiveAt: { type: Date }

  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
