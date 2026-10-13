import { Artist } from '../models/Artist.js';

export async function listArtists(req, res) {
  const items = await Artist.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ items });
}
