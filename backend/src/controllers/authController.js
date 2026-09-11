import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(user) {
  return jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export async function register(req, res) {
  const { name, email, password, currency } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, currency: currency || 'NGN' });

  const token = signToken(user);
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}

// Dedicated admin login — deliberately separate from the regular /login
// route. Even a correct email/password for a non-admin account is
// rejected here, so the admin queue dashboard can never be reached
// through a regular user's credentials or session.
export async function adminLogin(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !user.passwordHash || !user.isAdmin) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid admin credentials' });

  // Shorter-lived token for admin sessions, since this account can see
  // every user's CV, cover letter, and payment data.
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}

// The frontend sends only the raw Google ID token — we verify it here,
// server-side, and pull the user's identity from the verified payload.
// (Previously this trusted client-supplied googleId/email/name directly,
// which would let anyone log in as anyone by just POSTing those fields.)
export async function googleAuth(req, res) {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: googleId, email, name } = payload;

  let user = await User.findOne({ googleId });
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      await user.save();
    } else {
      user = await User.create({ name, email, googleId });
    }
  }

  const token = signToken(user);
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}
