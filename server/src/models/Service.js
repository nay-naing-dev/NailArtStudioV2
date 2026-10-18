import mongoose from 'mongoose';

// A salon treatment that can be booked and priced (manicure, pedicure, foot spa...).
// Visual nail art lives in NailDesign; the two never share a collection.
const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, trim: true, lowercase: true, default: 'general' },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, default: 60, min: 15, max: 480 }, // minutes
    description: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

serviceSchema.index({ isActive: 1, category: 1, title: 1 });

serviceSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Service = mongoose.model('Service', serviceSchema);
