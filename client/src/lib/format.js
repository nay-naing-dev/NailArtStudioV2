const CURRENCY = import.meta.env.VITE_CURRENCY || 'MMK';

export const formatPrice = (n) =>
  n == null ? '' : new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);

/** "2026-10-14" -> "Wed, 14 Oct 2026". Parsed as UTC so it never shifts a day. */
export const formatDate = (dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

/** "14:00" -> "2:00 PM" (locale-dependent). */
export const formatTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
};

/** Local calendar date as YYYY-MM-DD, offset by `days`. */
export function isoDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

// Mirrors TRANSITIONS in server/src/controllers/appointments.controller.js
export const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled', 'no_show', 'pending'],
  completed: ['confirmed'],
  cancelled: ['pending', 'confirmed'],
  no_show: ['confirmed', 'completed'],
};
