import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },

    matchScore: Number,

    coverLetterUrl: String, // Cloudinary URL of the generated, job-specific cover letter

    amount: { type: Number, required: true }, // in minor units (kobo/cents)
    currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },
    paymentRef: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending'
    },

    // pending_payment -> queued (paid, waiting for admin) -> applied
    // if the job closes before applying: closed_pending_replacement
    status: {
      type: String,
      enum: ['pending_payment', 'queued', 'applied', 'closed_pending_replacement', 'refunded'],
      default: 'pending_payment'
    },

    appliedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model('Application', applicationSchema);
