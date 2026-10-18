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

// One AI try-on generation. The customer's original photo is never stored: it lives in memory while the
// job runs. Only the finished result is kept, and it is deleted after TRYON_RETENTION_DAYS.
const tryOnSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    design: { type: mongoose.Schema.Types.ObjectId, ref: 'NailDesign', required: true },
    status: { type: String, enum: ['pending', 'processing', 'succeeded', 'failed'], default: 'pending' },
    resultImage: assetSchema,
    error: String,
    model: String,
    predictionId: String,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
);

tryOnSchema.index({ createdAt: 1 });

tryOnSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.predictionId;
    return ret;
  },
});

export const TryOn = mongoose.model('TryOn', tryOnSchema);
