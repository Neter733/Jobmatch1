import { findMatchesForUser } from '../services/matchingService.js';

export async function getMatches(req, res) {
  const matches = await findMatchesForUser(req.user);
  res.json(matches);
}
