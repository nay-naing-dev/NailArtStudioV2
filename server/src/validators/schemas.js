import { z } from 'zod';
import { APPOINTMENT_STATUSES } from '../models/Appointment.js';
import { DISCOUNT_TYPES } from '../models/Promotion.js';

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

// ---------- nail designs (gallery and try-on) ----------
// Multipart fields arrive as strings, so coerce them.
const tags = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((t) => t.trim()).filter(Boolean));
const boolish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
const skinTolerance = z.coerce.number().min(0).max(5);

export const createDesignBody = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(40).optional(),
  tags: tags.optional(),
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

// ---------- services (salon treatments and pricing) ----------
export const createServiceBody = z.object({
  title: z.string().trim().min(1).max(100),
  category: z.string().trim().max(40).optional(),
  price: z.coerce.number().min(0),
  duration: z.coerce.number().int().min(15).max(480).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const updateServiceBody = createServiceBody.partial().extend({ isActive: boolish.optional() });

export const listServicesQuery = z.object({
  category: z.string().trim().optional(),
  all: boolish.optional(),
  ...pageQuery,
});

// ---------- appointments ----------
export const availabilityQuery = z.object({ date: dateStr });

export const createAppointmentBody = z.object({
  serviceId: objectId,
  designId: objectId.optional(), // optional nail art reference
  artistId: objectId.optional(),
  date: dateStr,
  startTime: timeStr,
  customerName: z.string().trim().min(1).max(80).optional(),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: phone.optional(),
  notes: z.string().trim().max(500).optional(),
  promoCode: z.string().trim().max(30).optional(),
});

export const quoteBody = z.object({
  serviceId: objectId,
  designId: objectId.optional(),
  promoCode: z.string().trim().max(30).optional(),
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

// ---------- promotions ----------
// Ranges that depend on two fields (percent <= 100, expiry >= start) are checked by the model, so they hold on updates too.
const promoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3-30 letters, numbers, - or _');

export const createPromotionBody = z.object({
  title: z.string().trim().min(1).max(80),
  code: z.union([promoCode, z.literal('')]).optional(), // '' removes the code (automatic promotion)
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.coerce.number().positive(),
  startDate: dateStr,
  expiryDate: dateStr,
  isActive: z.boolean().optional(),
});

export const updatePromotionBody = createPromotionBody.partial();

// ---------- try-on ----------
export const createTryOnBody = z.object({ designId: objectId });

// ---------- admin email broadcast ----------
export const broadcastBody = z.object({
  // No line breaks: they would let someone inject extra mail headers.
  subject: z.string().trim().min(1, 'Subject is required').max(150).regex(/^[^\r\n]*$/, 'Subject must be one line'),
  messageContent: z.string().trim().min(1, 'Message is required').max(10000),
});
