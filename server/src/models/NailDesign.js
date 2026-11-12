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

// single:  one texture for every nail (auto-extracted from a photo, or a hand-cropped close-up)
// set:     a full press-on set, with its own texture for each finger
// pattern: a flat swatch, tiled across the nails at a constant scale
export const DESIGN_TYPES = ['single', 'set', 'pattern'];
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const SEGMENT_ROLES = [...FINGERS, 'texture'];

const fingerImagesSchema = new mongoose.Schema(Object.fromEntries(FINGERS.map((f) => [f, assetSchema])), { _id: false });

// A crop box the admin drew on the original photo, kept so the segments can be edited later.
// Coordinates are fractions (0-1) of the EXIF-rotated original; turn rotates the crop so the nail tip points up.
const segmentSchema = new mongoose.Schema(
  {
    role: { type: String, enum: SEGMENT_ROLES, required: true },
    box: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
    },
    turn: { type: Number, enum: [0, 90, 180, 270], default: 0 },
  },
  { _id: false },
);

// Visual nail art for the gallery and virtual try-on. Treatments and pricing live in Service.
const nailDesignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, lowercase: true, default: 'general' },
    tags: [{ type: String, trim: true, lowercase: true }],
    designType: { type: String, enum: DESIGN_TYPES, default: 'single' },

    // Set when an admin hand-edited the try-on texture; a re-extract replaces the texture and clears it.
    textureEditedAt: Date,

    // Reference photo exactly as the admin uploaded it (may show a hand, background, props). Exposed as `imageUrl`.
    originalImage: assetSchema,
    // Transparent PNG of the nail regions only: background and skin removed.
    isolatedImage: assetSchema,
    // Upright, fully opaque texture of a single nail, used to warp onto nails in try-on. Exposed as `textureUrl`.
    swatchImage: assetSchema,
    dominantColor: { type: String, match: /^#[0-9a-f]{6}$/i },
    // Full sets only: an upright texture per finger. Fingers left out fall back to swatchImage. Exposed as `fingerTextures`.
    fingerImages: fingerImagesSchema,
    // Boxes for hand-segmented designs (empty for auto-extracted ones).
    segments: { type: [segmentSchema], default: undefined },
    // Set when this design was split out of a full-set photo as a standalone variation.
    variantOf: { type: mongoose.Schema.Types.ObjectId, ref: 'NailDesign' },

    processing: {
      status: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
      method: String, // background-removal provider that was used, or 'manual' for hand-segmented designs
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
    ret.designType ??= 'single';
    ret.fingerTextures =
      ret.designType === 'set' && ret.fingerImages
        ? Object.fromEntries(FINGERS.filter((f) => ret.fingerImages[f]).map((f) => [f, ret.fingerImages[f].url]))
        : null;
    return ret;
  },
});

// Reuses the original `designs` collection, so existing nail art is kept.
export const NailDesign = mongoose.model('NailDesign', nailDesignSchema, 'designs');
