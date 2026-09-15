import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    email: {
      type: String,
      required: true,
      unique: true
    },

    passwordHash: {
      type: String
    },

    googleId: {
      type: String
    },

    currency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN'
    },

    cvUrl: {
      type: String
    },

    skillsProfile: {
      skills: [String],

      parsedExperienceYears: Number,

      rawParsedText: String
    },


    // --------------------------------------------------
    // SEMANTIC CV MATCHING
    // --------------------------------------------------

    // Cached vector representation of the user's CV.
    matchingEmbedding: {
      type: [Number],
      default: undefined
    },

    // Hash of the CV/profile that produced the vector.
    matchingEmbeddingHash: {
      type: String,
      default: null
    },

    matchingEmbeddingUpdatedAt: Date,


    // --------------------------------------------------
    // COVER LETTER QUESTIONNAIRE
    // --------------------------------------------------

    coverLetterQuestionnaire: {
      greatestAchievement: {
        type: String,
        default: ''
      },

      skillsAndTools: {
        type: String,
        default: ''
      },

      experienceSummary: {
        type: String,
        default: ''
      },

      wordCount: {
        type: Number,
        default: 0
      }
    },


    // --------------------------------------------------
    // USER ROLES
    // --------------------------------------------------

    role: {
      type: String,
      enum: [
        'user',
        'staff',
        'manager',
        'admin'
      ],
      default: 'user'
    },

    isAdmin: {
      type: Boolean,
      default: false
    },


    lastActiveAt: Date
  },

  {
    timestamps: true
  }
);


export default mongoose.model(
  'User',
  userSchema
);
