import mongoose from 'mongoose';

// A staff member flagging a user account for manager attention —
// e.g. a payment dispute, a suspicious profile, an application issue.
const escalationSchema = new mongoose.Schema(
  {
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    aboutUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' }
  },
  { timestamps: true }
);

export default mongoose.model('Escalation', escalationSchema);
