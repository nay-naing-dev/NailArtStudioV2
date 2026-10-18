import { config } from '../config/env.js';
import { Promotion } from '../models/Promotion.js';
import { studioNow } from './slots.js';

/**
 * Pricing rules for a booking:
 *  - The service sets the price. A nail design never adds to it.
 *  - Combo: booking a service together with a design takes `COMBO_DISCOUNT_PERCENT` off (0 disables it).
 *  - Promotion: at most one per booking. The best of the live automatic promotions and the customer's
 *    promo code is used. It stacks with the combo discount.
 * Every discount is worked out on the service price (not compounded) so each line reads as advertised.
 */

/** Promotion state on a given studio date: live | scheduled | expired | inactive. */
export function promotionState(promo, today = studioNow().date) {
  if (!promo.isActive) return 'inactive';
  if (today < promo.startDate) return 'scheduled';
  if (today > promo.expiryDate) return 'expired';
  return 'live';
}

const amountOff = (base, type, value) =>
  Math.min(base, type === 'percentage' ? Math.round((base * value) / 100) : Math.round(value));

const promoLine = (promo, base) => ({
  kind: 'promotion',
  title: promo.title,
  code: promo.code,
  promotion: promo._id,
  discountType: promo.discountType,
  discountValue: promo.discountValue,
  amount: amountOff(base, promo.discountType, promo.discountValue),
});

const CODE_MESSAGES = {
  scheduled: "This promo code isn't active yet.",
  expired: 'This promo code has expired.',
  inactive: 'This promo code is no longer available.',
};

/**
 * @param {{ service: { price: number }, design?: object, promoCode?: string, today?: string }} input
 * @returns {Promise<{ subtotal, discounts, discountTotal, total, promo: { code, status, message } | null }>}
 *   promo.status: applied | superseded (a better automatic promotion won) | invalid
 *   promo.reason: not_found | scheduled | expired | inactive | superseded (for translated client messages)
 */
export async function quoteBooking({ service, design, promoCode, today = studioNow().date }) {
  const subtotal = service.price;
  const discounts = [];

  const comboPercent = config.pricing.comboDiscountPercent;
  if (design && comboPercent > 0) {
    discounts.push({
      kind: 'combo',
      title: 'Service + Design combo',
      discountType: 'percentage',
      discountValue: comboPercent,
      amount: amountOff(subtotal, 'percentage', comboPercent),
    });
  }

  const automatic = await Promotion.find({
    isActive: true,
    code: null, // matches promotions without a code
    startDate: { $lte: today },
    expiryDate: { $gte: today },
  });
  const candidates = automatic.map((p) => promoLine(p, subtotal));

  let promo = null;
  let codeLine;
  const code = promoCode?.trim().toUpperCase();
  if (code) {
    const found = await Promotion.findOne({ code });
    const state = found && promotionState(found, today);
    if (!found) promo = { code, status: 'invalid', reason: 'not_found', message: "That promo code isn't valid." };
    else if (state !== 'live') promo = { code, status: 'invalid', reason: state, message: CODE_MESSAGES[state] };
    else candidates.push((codeLine = promoLine(found, subtotal)));
  }

  // `>=` so an entered code wins a tie with an automatic promotion (the code is listed last).
  const best = candidates.reduce((a, b) => (b.amount >= (a?.amount ?? -1) ? b : a), undefined);
  if (best && best.amount > 0) discounts.push(best);
  if (codeLine) {
    promo =
      best === codeLine
        ? { code, status: 'applied', reason: null, message: null }
        : { code, status: 'superseded', reason: 'superseded', message: 'A better promotion is already applied to this booking.' };
  }

  const discountTotal = Math.min(subtotal, discounts.reduce((sum, d) => sum + d.amount, 0));
  return { subtotal, discounts, discountTotal, total: subtotal - discountTotal, promo };
}
