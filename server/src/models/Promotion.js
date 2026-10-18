import mongoose from 'mongoose';

export const DISCOUNT_TYPES = ['percentage', 'fixed'];

// An admin-run discount campaign (Thadingyut, Thingyan, flash sales...).
// Without a `code` it applies automatically while live; with one, only when the customer enters it.
// Dates are studio-local "YYYY-MM-DD" strings and both ends are inclusive, matching how appointments store dates.
const promotionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    // Stored upper-case; empty values are unset so the sparse unique index ignores them.
    code: { type: String, trim: true, uppercase: true, set: (v) => v || undefined },
    discountType: { type: String, enum: DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, required: true, min: 0 },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    expiryDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

promotionSchema.pre('validate', function checkRanges(next) {
  if (this.discountType === 'percentage' && this.discountValue > 100) {
    this.invalidate('discountValue', 'A percentage discount cannot exceed 100');
  }
  if (this.startDate && this.expiryDate && this.expiryDate < this.startDate) {
    this.invalidate('expiryDate', 'The expiry date must be on or after the start date');
  }
  next();
});

promotionSchema.index({ code: 1 }, { unique: true, sparse: true });
promotionSchema.index({ isActive: 1, startDate: 1, expiryDate: 1 });

promotionSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Promotion = mongoose.model('Promotion', promotionSchema);
