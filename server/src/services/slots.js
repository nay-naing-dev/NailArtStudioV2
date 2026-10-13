import { config } from '../config/env.js';
import { Appointment } from '../models/Appointment.js';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Current date ("YYYY-MM-DD") and minutes since midnight in the studio's time zone. */
export function studioNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.studio.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

/** Every slot in the studio's working hours for a date, ignoring bookings. */
export function slotTemplate() {
  const { openTime, closeTime, slotMinutes } = config.studio;
  const slots = [];
  for (let t = toMinutes(openTime); t + slotMinutes <= toMinutes(closeTime); t += slotMinutes) {
    slots.push({ startTime: toHHMM(t), endTime: toHHMM(t + slotMinutes) });
  }
  return slots;
}

/** Why a date can't be booked, or null if it's bookable. */
export function dateClosedReason(date) {
  const now = studioNow();
  if (date < now.date) return 'Date is in the past';
  if (date > addDays(now.date, config.studio.bookingWindowDays)) {
    return `Bookings open ${config.studio.bookingWindowDays} days in advance`;
  }
  if (config.studio.closedWeekdays.includes(weekday(date))) return 'The studio is closed on this day';
  return null;
}

export async function getAvailability(date) {
  const closedReason = dateClosedReason(date);
  if (closedReason) return { date, open: false, reason: closedReason, slots: [] };

  const booked = await Appointment.find({ date, active: true }).select('startTime').lean();
  const taken = new Set(booked.map((a) => a.startTime));
  const now = studioNow();

  const slots = slotTemplate().map((s) => ({
    ...s,
    available: !taken.has(s.startTime) && !(date === now.date && toMinutes(s.startTime) <= now.minutes),
  }));
  return { date, open: true, slotMinutes: config.studio.slotMinutes, timezone: config.studio.timezone, slots };
}

/** Returns { slot } when startTime is a valid future slot on date, otherwise { error }. */
export function checkBookableSlot(date, startTime) {
  const reason = dateClosedReason(date);
  if (reason) return { error: reason };
  const slot = slotTemplate().find((s) => s.startTime === startTime);
  if (!slot) return { error: 'Not a valid time slot' };
  const now = studioNow();
  if (date === now.date && toMinutes(startTime) <= now.minutes) return { error: 'That time has already passed' };
  return { slot };
}
