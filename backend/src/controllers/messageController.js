import Message from '../models/Message.js';
import User from '../models/User.js';
import ChatReadState from '../models/ChatReadState.js';
import { uploadPrivateFile } from '../services/fileStorageService.js';

// Deterministic room key for a 1:1 conversation, independent of who
// started it — sorted so both directions produce the same room string.
function directRoomKey(idA, idB) {
  return [String(idA), String(idB)].sort().join('_');
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // matches teamController's threshold

// All staff/manager/admin contacts, for building the conversation list —
// plus the shared 'team' broadcast channel. Includes online status so
// the chat itself shows who's active right now, not just the Team page.
export async function listContacts(req, res) {
  const contacts = await User.find({
    role: { $in: ['staff', 'manager', 'admin'] },
    _id: { $ne: req.user._id }
  }).select('name role lastActiveAt');

  res.json(
    contacts.map((c) => ({
      _id: c._id,
      name: c.name,
      role: c.role,
      isOnline: c.lastActiveAt && Date.now() - c.lastActiveAt.getTime() < ONLINE_THRESHOLD_MS
    }))
  );
}

// Fetches messages for a room — either a direct conversation
// (?with=<userId>) or the shared 'team' channel (?room=team). Frontend
// polls this every few seconds rather than a persistent socket. Opening
// a room this way also marks it as read for unread-count purposes.
export async function getMessages(req, res) {
  const { with: withUserId, room } = req.query;
  const roomKey = room === 'team' ? 'team' : directRoomKey(req.user._id, withUserId);

  const messages = await Message.find({ room: roomKey })
    .populate('sender', 'name role')
    .sort({ createdAt: 1 })
    .limit(200);

  await ChatReadState.findOneAndUpdate(
    { user: req.user._id, room: roomKey },
    { lastReadAt: new Date() },
    { upsert: true }
  );

  res.json(messages);
}

export async function sendMessage(req, res) {
  const { text, with: withUserId, room } = req.body;
  const roomKey = room === 'team' ? 'team' : directRoomKey(req.user._id, withUserId);

  let fileUrl, fileName;
  if (req.file) {
    fileUrl = await uploadPrivateFile(req.file.buffer, `chat/${roomKey}`, `${Date.now()}-${req.file.originalname}`);
    fileName = req.file.originalname;
  }

  if (!text && !fileUrl) return res.status(400).json({ error: 'Message needs text or a file' });

  const message = await Message.create({ room: roomKey, sender: req.user._id, text: text || '', fileUrl, fileName });
  const populated = await message.populate('sender', 'name role');

  res.json(populated);
}

// Unread counts for every room this user is part of — the team channel
// plus a direct room with every other staff/manager/admin contact. Used
// to show badges in the chat contact list without the user having to
// open each conversation to check.
export async function getUnreadCounts(req, res) {
  const myId = req.user._id;

  const readStates = await ChatReadState.find({ user: myId });
  const lastReadByRoom = Object.fromEntries(readStates.map((r) => [r.room, r.lastReadAt]));

  const contacts = await User.find({
    role: { $in: ['staff', 'manager', 'admin'] },
    _id: { $ne: myId }
  }).select('_id');

  const rooms = [
    { key: 'team', room: 'team' },
    ...contacts.map((c) => ({ key: String(c._id), room: directRoomKey(myId, c._id) }))
  ];

  const counts = {};
  await Promise.all(
    rooms.map(async ({ key, room }) => {
      const since = lastReadByRoom[room] || new Date(0);
      counts[key] = await Message.countDocuments({
        room,
        sender: { $ne: myId },
        createdAt: { $gt: since }
      });
    })
  );

  res.json(counts); // { team: 2, "<contactUserId>": 0, ... }
}
