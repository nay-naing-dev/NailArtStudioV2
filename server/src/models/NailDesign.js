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

// Visual nail art for the gallery and virtual try-on. Treatments and pricing live in Service.
const nailDesignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, lowercase: true, default: 'general' },
    tags: [{ type: String, trim: true, lowercase: true }],

    // Set when an admin hand-edited the try-on texture; a re-extract replaces the texture and clears it.
    textureEditedAt: Date,

    // Reference photo exactly as the admin uploaded it (may show a hand, background, props). Exposed as `imageUrl`.
    originalImage: assetSchema,
    // Transparent PNG of the nail regions only: background and skin removed.
    isolatedImage: assetSchema,
    // Upright, fully opaque texture of a single nail, used to warp onto nails in try-on. Exposed as `textureUrl`.
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

nailDesignSchema.index({ isActive: 1, 'processing.status': 1, createdAt: -1 });
nailDesignSchema.index({ title: 'text', description: 'text', tags: 'text' });

// The asset sub-documents keep the storage ids needed to delete files; clients get the plain URLs.
nailDesignSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    ret.imageUrl = ret.originalImage?.url;
    ret.textureUrl = ret.swatchImage?.url;
    return ret;
  },
});

// Reuses the original `designs` collection, so existing nail art is kept.
export const NailDesign = mongoose.model('NailDesign', nailDesignSchema, 'designs');
