import mongoose from 'mongoose';

// Single-document collection tracking sync progress per source,
// so a scheduled sync run picks up where the last one left off.
const syncStateSchema = new mongoose.Schema({
  source: { type: String, unique: true, required: true }, // e.g. "jobo"
  lastCursor: String,
  lastExpiredSyncAt: Date,
  lastRunAt: Date // generic "last time this source ran" for sources with a simple daily throttle (e.g. Adzuna's tight free quota)
});

export default mongoose.model('SyncState', syncStateSchema);
