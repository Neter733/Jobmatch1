import mongoose from 'mongoose';

// Lets an admin toggle job sources on/off and update their API keys from
// the admin panel without a code deploy. IMPORTANT LIMITATION: this only
// controls credentials/on-off for sources that already have connector
// code written (Jobo, Arbeitnow). A genuinely new/different API still
// needs its own connector function written first — this doesn't make
// arbitrary APIs "just work".
const jobSourceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. 'jobo', 'arbeitnow' — must match a real connector
    label: { type: String, required: true }, // display name in the admin UI
    apiKey: { type: String }, // optional — some sources (Arbeitnow) need none
    enabled: { type: Boolean, default: true },
    notes: { type: String } // free text, e.g. pricing reminders
  },
  { timestamps: true }
);

export default mongoose.model('JobSource', jobSourceSchema);
