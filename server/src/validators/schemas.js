import { z } from 'zod';
import { APPOINTMENT_STATUSES } from '../models/Appointment.js';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm');
const phone = z.string().trim().min(6).max(30);
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// ---------- auth ----------
export const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  phone: phone.optional(),
});

export const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// ---------- designs ----------
// Multipart fields arrive as strings, so coerce them.
const tags = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((t) => t.trim()).filter(Boolean));
const boolish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
const skinTolerance = z.coerce.number().min(0).max(5);

export const createDesignBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(40).optional(),
  tags: tags.optional(),
  price: z.coerce.number().min(0),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  skinTolerance: skinTolerance.optional(),
});

export const updateDesignBody = createDesignBody.partial().extend({ isActive: boolish.optional() });

export const reprocessBody = z.object({ skinTolerance: skinTolerance.optional() });

export const listDesignsQuery = z.object({
  category: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
  all: boolish.optional(),
  ...pageQuery,
});

// ---------- appointments ----------
export const availabilityQuery = z.object({ date: dateStr });

export const createAppointmentBody = z.object({
  designId: objectId.optional(),
  artistId: objectId.optional(),
  date: dateStr,
  startTime: timeStr,
  customerName: z.string().trim().min(1).max(80).optional(),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: phone.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const listAppointmentsQuery = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  search: z.string().trim().max(100).optional(),
  ...pageQuery,
});

export const updateStatusBody = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  adminNotes: z.string().trim().max(1000).optional(),
});

// ---------- try-on ----------
export const createTryOnBody = z.object({ designId: objectId });
