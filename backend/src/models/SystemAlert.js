import mongoose from 'mongoose';

const systemAlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['jobo_auth_failed', 'jobo_billing_issue', 'jobo_sync_error', 'arbeitnow_sync_error', 'job_sync_error'],
      required: true
    },
    message: String,
    resolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model('SystemAlert', systemAlertSchema);
