import mongoose from 'mongoose';

// Tracks the last time a user viewed a given chat room, so unread counts
// can be computed (messages in that room newer than this, not sent by
// the user themselves).
const chatReadStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: String, required: true },
  lastReadAt: { type: Date, default: Date.now }
});

chatReadStateSchema.index({ user: 1, room: 1 }, { unique: true });

export default mongoose.model('ChatReadState', chatReadStateSchema);
