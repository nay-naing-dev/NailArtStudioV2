import sharp from 'sharp';
import { NailDesign } from '../models/NailDesign.js';
import { processDesign, isProcessing } from '../services/designProcessor.js';
import { deleteImage, uploadImage } from '../services/storage.js';
import { ApiError } from '../utils/ApiError.js';

const isAdmin = (req) => req.user?.role === 'admin';
const publicFilter = { isActive: true, 'processing.status': 'ready' };

// Stores the reference photo as a JPEG with EXIF rotation applied, so HEIC and other uploads display everywhere.
async function storeOriginal(file) {
  const jpeg = await sharp(file.buffer).rotate().jpeg({ quality: 90 }).toBuffer();
  return uploadImage(jpeg, { folder: 'designs/originals', format: 'jpg' });
}

export async function listDesigns(req, res) {
  const { category, search, all, page, limit } = req.query;
  const filter = all && isAdmin(req) ? {} : { ...publicFilter };
  if (category) filter.category = category.toLowerCase();
  if (search) filter.$text = { $search: search };

  const [items, total] = await Promise.all([
    NailDesign.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    NailDesign.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function getDesign(req, res) {
  const design = await NailDesign.findById(req.params.id);
  const visible = design && (isAdmin(req) || (design.isActive && design.processing?.status === 'ready'));
  if (!visible) throw ApiError.notFound('Design not found');
  res.json({ design });
}

export async function createDesign(req, res) {
  if (!req.file) throw ApiError.badRequest('A reference image is required (field "image")');
  const { skinTolerance, ...fields } = req.body;
  const originalImage = await storeOriginal(req.file);
  const design = await NailDesign.create({
    ...fields,
    originalImage,
    processing: { status: 'pending' },
    createdBy: req.user.id,
  });

  // Runs in the background. Clients poll GET /designs/:id for processing.status.
  processDesign(design.id, { buffer: req.file.buffer, skinTolerance });
  res.status(202).json({ design });
}

export async function updateDesign(req, res) {
  const design = await NailDesign.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  const { skinTolerance, ...fields } = req.body;
  design.set(fields);

  let reprocess = false;
  if (req.file) {
    if (isProcessing(design.id)) throw ApiError.conflict('This design is still processing. Try again shortly.');
    const old = design.originalImage;
    design.originalImage = await storeOriginal(req.file);
    design.processing = { status: 'pending' };
    await deleteImage(old);
    reprocess = true;
  }
  await design.save();
  if (reprocess) processDesign(design.id, { buffer: req.file.buffer, skinTolerance });
  res.status(reprocess ? 202 : 200).json({ design });
}

/**
 * Replaces the try-on texture with one the admin cropped/edited by hand after extraction
 * (PUT /designs/:id/texture, multipart field "image"). Re-extracting later overwrites it.
 */
export async function updateTexture(req, res) {
  if (!req.file) throw ApiError.badRequest('A texture image is required (field "image")');
  const design = await NailDesign.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  if (design.processing?.status !== 'ready') throw ApiError.conflict('Wait for the extraction to finish before editing the texture');
  if (isProcessing(design.id)) throw ApiError.conflict('This design is processing. Try again shortly.');

  // Opaque PNG, capped in size like the extracted swatch, with EXIF rotation applied.
  const png = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  const old = design.swatchImage;
  design.swatchImage = await uploadImage(png, { folder: 'designs/swatches' });
  design.textureEditedAt = new Date();
  await design.save();
  await deleteImage(old);
  res.json({ design });
}

export async function reprocessDesign(req, res) {
  const design = await NailDesign.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  if (isProcessing(design.id)) throw ApiError.conflict('This design is already processing');

  design.processing = { ...design.processing?.toObject?.(), status: 'pending', error: undefined };
  await design.save();
  processDesign(design.id, { skinTolerance: req.body.skinTolerance });
  res.status(202).json({ design });
}

// Archives rather than deletes, because existing appointments and try-ons still reference the design.
export async function archiveDesign(req, res) {
  const design = await NailDesign.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!design) throw ApiError.notFound('Design not found');
  res.json({ design });
}
