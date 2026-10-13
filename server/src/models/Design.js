import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    provider: { type: String, enum: ['cloudinary', 'local'], required: true },
    width: Number,
    height: Number,
  },
  { _id: false },
);

export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'];

const designSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, lowercase: true, default: 'general' },
    tags: [{ type: String, trim: true, lowercase: true }],
    price: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, default: 60, min: 15 },

    // Reference photo exactly as the admin uploaded it (may show a hand, background, props).
    originalImage: assetSchema,
    // Transparent PNG of the nail regions only: background and skin removed.
    isolatedImage: assetSchema,
    // Upright, fully opaque texture of a single nail, used to warp onto nails in try-on.
    swatchImage: assetSchema,
    dominantColor: { type: String, match: /^#[0-9a-f]{6}$/i },

    processing: {
      status: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
      method: String, // background-removal provider that was used
      skinTolerance: Number,
      nailsDetected: Number,
      error: String,
      startedAt: Date,
      finishedAt: Date,
    },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

designSchema.index({ isActive: 1, 'processing.status': 1, createdAt: -1 });
designSchema.index({ name: 'text', description: 'text', tags: 'text' });

designSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Design = mongoose.model('Design', designSchema);
