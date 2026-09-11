import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    source: { type: String, default: 'jobo' }, // room to add more sources later
    externalId: { type: String, required: true }, // ID from the source API
    title: { type: String, required: true },
    company: String,
    location: String,
    description: String,
    applyLink: { type: String, required: true },
    skillsExtracted: [String], // parsed from description for matching

    status: { type: String, enum: ['open', 'closed'], default: 'open' },

    rawData: mongoose.Schema.Types.Mixed // keep the original API response for debugging
  },
  { timestamps: true }
);

jobSchema.index({ source: 1, externalId: 1 }, { unique: true }); // dedupe across ingestion runs

export default mongoose.model('Job', jobSchema);
