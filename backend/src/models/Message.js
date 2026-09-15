import mongoose from 'mongoose';

// Internal chat between staff/manager/admin accounts. "room" is a stable
// key for a conversation — either a direct 1:1 (sorted pair of user IDs
// joined with '_') or 'team' for the shared all-staff channel.
const messageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '' },
    fileUrl: { type: String }, // Cloudinary URL for an attached file/photo
    fileName: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model('Message', messageSchema);
