import sharp from 'sharp';
import { Design } from '../models/Design.js';
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
  const { kind, category, search, all, page, limit } = req.query;
  const filter = all && isAdmin(req) ? {} : { ...publicFilter };
  // Designs saved before `kind` existed have no value, so "design" means "anything that isn't a service".
  if (kind === 'service') filter.kind = 'service';
  else if (kind === 'design') filter.kind = { $ne: 'service' };
  if (category) filter.category = category.toLowerCase();
  if (search) filter.$text = { $search: search };

  const [items, total] = await Promise.all([
    Design.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Design.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function getDesign(req, res) {
  const design = await Design.findById(req.params.id);
  const visible = design && (isAdmin(req) || (design.isActive && design.processing?.status === 'ready'));
  if (!visible) throw ApiError.notFound('Design not found');
  res.json({ design });
}

export async function createDesign(req, res) {
  const { skinTolerance, ...fields } = req.body;

  // Services (pedicure, foot spa...) need no try-on processing, and the photo is optional.
  if (fields.kind === 'service') {
    const service = await Design.create({
      ...fields,
      originalImage: req.file ? await storeOriginal(req.file) : undefined,
      processing: { status: 'ready' },
      createdBy: req.user.id,
    });
    return res.status(201).json({ design: service });
  }

  if (!req.file) throw ApiError.badRequest('A reference image is required (field "image")');
  const originalImage = await storeOriginal(req.file);
  const design = await Design.create({
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
  const design = await Design.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  const { skinTolerance, ...fields } = req.body;
  design.set(fields);

  let reprocess = false;
  if (req.file && design.kind === 'service') {
    const old = design.originalImage;
    design.originalImage = await storeOriginal(req.file);
    if (old) await deleteImage(old);
  } else if (req.file) {
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

export async function reprocessDesign(req, res) {
  const design = await Design.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  if (isProcessing(design.id)) throw ApiError.conflict('This design is already processing');

  design.processing = { ...design.processing?.toObject?.(), status: 'pending', error: undefined };
  await design.save();
  processDesign(design.id, { skinTolerance: req.body.skinTolerance });
  res.status(202).json({ design });
}

// Archives rather than deletes, because existing appointments still reference the design.
export async function archiveDesign(req, res) {
  const design = await Design.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!design) throw ApiError.notFound('Design not found');
  res.json({ design });
}
