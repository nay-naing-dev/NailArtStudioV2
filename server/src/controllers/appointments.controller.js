import { Appointment } from '../models/Appointment.js';
import { Artist } from '../models/Artist.js';
import { Design } from '../models/Design.js';
import { getAvailability, checkBookableSlot, studioNow } from '../services/slots.js';
import { ApiError } from '../utils/ApiError.js';

const DESIGN_FIELDS = 'name price dominantColor swatchImage isolatedImage';
const ARTIST_FIELDS = 'name role image';
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

export async function createAppointment(req, res) {
  const { designId, artistId, date, startTime, notes } = req.body;
  const customerName = req.body.customerName ?? req.user?.name;
  const customerEmail = req.body.customerEmail ?? req.user?.email;
  const customerPhone = req.body.customerPhone ?? req.user?.phone;
  if (!customerName || !customerEmail || !customerPhone) {
    throw ApiError.badRequest('Name, email and phone are required');
  }

  const { slot, error } = checkBookableSlot(date, startTime);
  if (error) throw ApiError.badRequest(error);

  let design;
  if (designId) {
    design = await Design.findOne({ _id: designId, isActive: true });
    if (!design) throw ApiError.badRequest('Selected design is not available');
  }

  let artist;
  if (artistId) {
    artist = await Artist.findOne({ _id: artistId, isActive: true });
    if (!artist) throw ApiError.badRequest('Selected artist is not available');
  }

  // The unique partial index rejects a double booking with error 11000; errorHandler turns that into 409.
  const appointment = await Appointment.create({
    design: design?._id,
    artist: artist?._id,
    customer: req.user?._id,
    customerName,
    customerEmail,
    customerPhone,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    priceAtBooking: design?.price,
    notes,
    statusHistory: [{ status: 'pending', by: req.user?._id }],
  });
  await appointment.populate([
    { path: 'design', select: DESIGN_FIELDS },
    { path: 'artist', select: ARTIST_FIELDS },
  ]);
  res.status(201).json({ appointment });
}

export async function myAppointments(req, res) {
  const items = await Appointment.find({ customer: req.user._id })
    .sort({ date: -1, startTime: -1 })
    .populate('design', DESIGN_FIELDS)
    .populate('artist', ARTIST_FIELDS);
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
      .populate('design', DESIGN_FIELDS)
    .populate('artist', ARTIST_FIELDS)
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
  await appt.populate([
    { path: 'design', select: DESIGN_FIELDS },
    { path: 'artist', select: ARTIST_FIELDS },
  ]);
  res.json({ appointment: appt });
}
