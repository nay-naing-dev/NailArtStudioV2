import { Promotion } from '../models/Promotion.js';
import { promotionState } from '../services/pricing.js';
import { studioNow } from '../services/slots.js';
import { ApiError } from '../utils/ApiError.js';

// Adds the live/scheduled/expired/inactive state, worked out in the studio's time zone.
const withState = (promo, today = studioNow().date) => ({ ...promo.toJSON(), state: promotionState(promo, today) });

export async function listPromotions(req, res) {
  const today = studioNow().date;
  const items = await Promotion.find().sort({ expiryDate: -1, startDate: -1 });
  res.json({ items: items.map((p) => withState(p, today)), today });
}

export async function createPromotion(req, res) {
  const promotion = await Promotion.create({ ...req.body, createdBy: req.user.id });
  res.status(201).json({ promotion: withState(promotion) });
}

export async function updatePromotion(req, res) {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) throw ApiError.notFound('Promotion not found');
  promotion.set(req.body);
  await promotion.save();
  res.json({ promotion: withState(promotion) });
}

// A real delete: bookings keep their own copy of any discount they received.
export async function deletePromotion(req, res) {
  const promotion = await Promotion.findByIdAndDelete(req.params.id);
  if (!promotion) throw ApiError.notFound('Promotion not found');
  res.status(204).end();
}
