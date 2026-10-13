import { aiTryOnEnabled, config } from '../config/env.js';
import { Design } from '../models/Design.js';
import { TryOn } from '../models/TryOn.js';
import { modelName } from '../services/replicate.js';
import { processTryOn } from '../services/tryonProcessor.js';
import { ApiError } from '../utils/ApiError.js';

export function tryOnConfig(req, res) {
  res.json({ enabled: aiTryOnEnabled(), retentionDays: config.tryon.retentionDays, maxPx: config.tryon.maxPx });
}

export async function createTryOn(req, res) {
  if (!aiTryOnEnabled()) throw new ApiError(503, 'AI try-on is not set up on this server.');
  const photo = req.files?.photo?.[0];
  const mask = req.files?.mask?.[0];
  if (!photo || !mask) throw ApiError.badRequest('Both "photo" and "mask" images are required');

  const design = await Design.findOne({ _id: req.body.designId, isActive: true, 'processing.status': 'ready' });
  if (!design) throw ApiError.badRequest('That design is not available');

  // Spending cap across all users, so a bug or abuse can't run up the Replicate bill.
  const since = new Date(Date.now() - 86_400_000);
  if ((await TryOn.countDocuments({ createdAt: { $gte: since } })) >= config.tryon.dailyLimit) {
    throw new ApiError(429, 'AI try-on has reached its daily limit. Please try again tomorrow.');
  }
  // One at a time per user: a second request while one is running is almost always a double click.
  if (await TryOn.exists({ user: req.user._id, status: { $in: ['pending', 'processing'] }, createdAt: { $gte: new Date(Date.now() - config.replicate.timeoutMs - 60_000) } })) {
    throw ApiError.conflict('You already have a try-on in progress.');
  }

  const tryOn = await TryOn.create({ user: req.user._id, design: design._id, model: modelName() });
  processTryOn(tryOn.id, { photo: photo.buffer, mask: mask.buffer }); // not awaited: clients poll GET /tryon/:id
  res.status(202).json({ tryOn });
}

export async function getTryOn(req, res) {
  const tryOn = await TryOn.findById(req.params.id).populate('design', 'name price');
  // Results show a customer's hand, so only the owner (or an admin) may see them.
  if (!tryOn || (!tryOn.user.equals(req.user._id) && req.user.role !== 'admin')) throw ApiError.notFound('Try-on not found');
  res.json({ tryOn });
}
