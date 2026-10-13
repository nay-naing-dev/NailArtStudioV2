import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, required: true, trim: true, maxlength: 80 }, // e.g. "Senior Nail Stylist"
    bio: { type: String, trim: true, maxlength: 600 },
    image: { type: String, trim: true }, // profile photo URL (Cloudinary)
    imagePosition: { type: String, trim: true, default: '50% 50%', match: /^[\d.]+%? [\d.]+%?$/ }, // CSS object-position for the square crop
    specialties: { type: [String], default: [] },
    instagram: { type: String, trim: true }, // handle or full profile URL
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

artistSchema.index({ isActive: 1, sortOrder: 1, createdAt: 1 });

artistSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.isActive;
    return ret;
  },
});

export const Artist = mongoose.model('Artist', artistSchema);
