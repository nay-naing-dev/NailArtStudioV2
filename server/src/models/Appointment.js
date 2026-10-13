import mongoose from 'mongoose';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
// Statuses that keep the slot occupied.
const OCCUPYING = new Set(['pending', 'confirmed']);

const appointmentSchema = new mongoose.Schema(
  {
    design: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }, // optional preferred artist
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty for guest bookings
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },
    customerPhone: { type: String, required: true, trim: true },

    // Studio-local date and time strings, kept as strings so time zones can't shift them.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },

    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'pending' },
    // Mirrors OCCUPYING.has(status); backs the unique partial index below.
    active: { type: Boolean, default: true },

    priceAtBooking: Number,
    notes: { type: String, trim: true, maxlength: 500 },
    adminNotes: { type: String, trim: true, maxlength: 1000 },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: APPOINTMENT_STATUSES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true },
);

appointmentSchema.pre('save', function syncActive(next) {
  this.active = OCCUPYING.has(this.status);
  next();
});

// One live booking per slot. The database enforces it, so two simultaneous requests can't both win.
appointmentSchema.index(
  { date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'unique_active_slot' },
);
appointmentSchema.index({ customer: 1, date: -1 });
appointmentSchema.index({ status: 1, date: 1 });

appointmentSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.active;
    return ret;
  },
});

export const Appointment = mongoose.model('Appointment', appointmentSchema);
