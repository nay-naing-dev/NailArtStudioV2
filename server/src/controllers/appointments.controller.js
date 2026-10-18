import { Appointment } from '../models/Appointment.js';
import { Artist } from '../models/Artist.js';
import { NailDesign } from '../models/NailDesign.js';
import { Service } from '../models/Service.js';
import { quoteBooking } from '../services/pricing.js';
import { getAvailability, checkBookableSlot, studioNow } from '../services/slots.js';
import { ApiError } from '../utils/ApiError.js';

const SERVICE_FIELDS = 'title category price duration';
const DESIGN_FIELDS = 'title dominantColor originalImage swatchImage isolatedImage';
const ARTIST_FIELDS = 'name role image';
const POPULATE = [
  { path: 'service', select: SERVICE_FIELDS },
  { path: 'design', select: DESIGN_FIELDS },
  { path: 'artist', select: ARTIST_FIELDS },
];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Allowed admin status changes.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled', 'no_show', 'pending'],
  completed: ['confirmed'],
  cancelled: ['pending', 'confirmed'],
  no_show: ['confirmed', 'completed'],
};

export async function availability(req, res) {
  res.json(await getAvailability(req.query.date));
}

/** Loads the bookable service and optional design, or throws a 400. */
async function loadSelection(serviceId, designId) {
  const service = await Service.findOne({ _id: serviceId, isActive: true });
  if (!service) throw ApiError.badRequest('Selected service is not available');

  let design;
  if (designId) {
    design = await NailDesign.findOne({ _id: designId, isActive: true, 'processing.status': 'ready' });
    if (!design) throw ApiError.badRequest('Selected design is not available');
  }
  return { service, design };
}

/** Price breakdown for the booking summary (POST /appointments/quote). Doesn't reserve anything. */
export async function quote(req, res) {
  const { serviceId, designId, promoCode } = req.body;
  const { service, design } = await loadSelection(serviceId, designId);
  res.json(await quoteBooking({ service, design, promoCode }));
}

export async function createAppointment(req, res) {
  const { serviceId, designId, artistId, date, startTime, notes, promoCode } = req.body;
  const customerName = req.body.customerName ?? req.user?.name;
  const customerEmail = req.body.customerEmail ?? req.user?.email;
  const customerPhone = req.body.customerPhone ?? req.user?.phone;
  if (!customerName || !customerEmail || !customerPhone) {
    throw ApiError.badRequest('Name, email and phone are required');
  }

  const { slot, error } = checkBookableSlot(date, startTime);
  if (error) throw ApiError.badRequest(error);

  const { service, design } = await loadSelection(serviceId, designId);
  // Priced on the server at booking time, so the client can't choose its own discount.
  const price = await quoteBooking({ service, design, promoCode });
  if (price.promo?.status === 'invalid') throw ApiError.badRequest(price.promo.message);

  let artist;
  if (artistId) {
    artist = await Artist.findOne({ _id: artistId, isActive: true });
    if (!artist) throw ApiError.badRequest('Selected artist is not available');
  }

  // The unique partial index rejects a double booking with error 11000; errorHandler turns that into 409.
  const appointment = await Appointment.create({
    service: service._id,
    design: design?._id,
    artist: artist?._id,
    customer: req.user?._id,
    customerName,
    customerEmail,
    customerPhone,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    subtotalAtBooking: price.subtotal,
    priceAtBooking: price.total,
    discounts: price.discounts,
    notes,
    statusHistory: [{ status: 'pending', by: req.user?._id }],
  });
  await appointment.populate(POPULATE);
  res.status(201).json({ appointment });
}

export async function myAppointments(req, res) {
  const items = await Appointment.find({ customer: req.user._id })
    .sort({ date: -1, startTime: -1 })
    .populate(POPULATE);
  res.json({ items });
}

export async function cancelAppointment(req, res) {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw ApiError.notFound('Appointment not found');
  const isOwner = appt.customer && appt.customer.equals(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw ApiError.forbidden();
  if (!['pending', 'confirmed'].includes(appt.status)) {
    throw ApiError.badRequest(`A ${appt.status} appointment can't be cancelled`);
  }
  if (appt.date < studioNow().date) throw ApiError.badRequest("Past appointments can't be cancelled");

  appt.status = 'cancelled';
  appt.statusHistory.push({ status: 'cancelled', by: req.user._id });
  await appt.save();
  res.json({ appointment: appt });
}

// ---------- admin ----------

export async function listAppointments(req, res) {
  const { status, from, to, search, page, limit } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ customerName: rx }, { customerEmail: rx }, { customerPhone: rx }];
  }

  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ date: 1, startTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE)
      .populate('customer', 'name email'),
    Appointment.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function appointmentStats(req, res) {
  const today = studioNow().date;
  const [byStatus, todayCount, upcoming, revenue] = await Promise.all([
    Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Appointment.countDocuments({ date: today, active: true }),
    Appointment.countDocuments({ date: { $gte: today }, active: true }),
    Appointment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$priceAtBooking', 0] } } } },
    ]),
  ]);
  res.json({
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    today: todayCount,
    upcoming,
    completedRevenue: revenue[0]?.total ?? 0,
  });
}

export async function updateAppointmentStatus(req, res) {
  const { status, adminNotes } = req.body;
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw ApiError.notFound('Appointment not found');

  if (status !== appt.status) {
    if (!TRANSITIONS[appt.status]?.includes(status)) {
      throw ApiError.badRequest(`Can't change status from ${appt.status} to ${status}`);
    }
    appt.status = status;
    appt.statusHistory.push({ status, by: req.user._id });
  }
  if (adminNotes !== undefined) appt.adminNotes = adminNotes;
  // Reactivating a cancelled booking whose slot has since been taken fails here with 409.
  await appt.save();
  await appt.populate(POPULATE);
  res.json({ appointment: appt });
}
