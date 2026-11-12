import sharp from 'sharp';
import { NailDesign } from '../models/NailDesign.js';
import { generatedAssets, processDesign, isProcessing } from '../services/designProcessor.js';
import { segmentDesign } from '../services/designSegmenter.js';
import { deleteImage, readImage, uploadImage } from '../services/storage.js';
import { ApiError } from '../utils/ApiError.js';

const isAdmin = (req) => req.user?.role === 'admin';
const publicFilter = { isActive: true, 'processing.status': 'ready' };

// Stores the reference photo as a JPEG with EXIF rotation applied, so HEIC and other uploads display everywhere.
async function storeOriginal(file) {
  const jpeg = await sharp(file.buffer).rotate().jpeg({ quality: 90 }).toBuffer();
  return uploadImage(jpeg, { folder: 'designs/originals', format: 'jpg' });
}

/** Fields a hand-segmented design takes from segmentDesign(). Undefined values clear what auto-extraction left. */
function segmentedFields(result) {
  const now = new Date();
  return {
    designType: result.designType,
    swatchImage: result.swatchImage,
    fingerImages: result.fingerImages,
    isolatedImage: undefined,
    segments: result.segments,
    dominantColor: result.dominantColor,
    textureEditedAt: undefined,
    processing: { status: 'ready', method: 'manual', nailsDetected: result.segments.length, startedAt: now, finishedAt: now },
  };
}

/** Replaces a design's textures with freshly segmented ones, deletes the old files and splits out any variations. */
async function applySegments(design, result, userId) {
  const previous = generatedAssets(design);
  for (const [key, value] of Object.entries(segmentedFields(result))) design.set(key, value);
  await design.save();
  await Promise.all([...previous, result.unusedOriginal].map(deleteImage));
  return createVariations(design, result.variations, userId);
}

// Each variation box from a full-set photo becomes its own ready-to-use design.
function createVariations(parent, variations, userId) {
  return Promise.all(
    variations.map((v, i) =>
      NailDesign.create({
        title: `${parent.title} · ${v.label || `Variation ${i + 1}`}`.slice(0, 100),
        description: parent.description,
        category: parent.category,
        tags: parent.tags,
        designType: 'single',
        originalImage: v.originalImage,
        swatchImage: v.swatchImage,
        dominantColor: v.dominantColor,
        segments: [v.segment],
        variantOf: parent._id,
        processing: { status: 'ready', method: 'manual', nailsDetected: 1, startedAt: new Date(), finishedAt: new Date() },
        createdBy: userId,
      }),
    ),
  );
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
  const { skinTolerance, mode, segments, ...fields } = req.body;
  const originalImage = await storeOriginal(req.file);

  // Hand-segmented: cropping is quick, so the design is ready as soon as this request returns.
  if (mode !== 'auto') {
    let result;
    try {
      result = await segmentDesign(req.file.buffer, mode, segments);
    } catch (err) {
      await deleteImage(originalImage);
      throw err;
    }
    const design = await NailDesign.create({ ...fields, originalImage, ...segmentedFields(result), createdBy: req.user.id });
    await deleteImage(result.unusedOriginal);
    const variants = await createVariations(design, result.variations, req.user.id);
    return res.status(201).json({ design, variants });
  }

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
  const { skinTolerance, mode = 'auto', segments, ...fields } = req.body;
  design.set(fields);

  let reprocess = false;
  if (req.file) {
    if (isProcessing(design.id)) throw ApiError.conflict('This design is still processing. Try again shortly.');
    const old = design.originalImage;
    if (mode !== 'auto') {
      const result = await segmentDesign(req.file.buffer, mode, segments);
      design.originalImage = await storeOriginal(req.file);
      const variants = await applySegments(design, result, req.user.id);
      await deleteImage(old);
      return res.json({ design, variants });
    }
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
  // A set's fallback texture is one of its finger textures, so editing it alone would break that finger.
  if (design.designType === 'set') throw ApiError.conflict("Use Edit segments to change a full set's textures");

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

/** Re-crops the stored reference photo with new boxes (PUT /designs/:id/segments, JSON { mode, segments }). */
export async function resegmentDesign(req, res) {
  const design = await NailDesign.findById(req.params.id);
  if (!design) throw ApiError.notFound('Design not found');
  if (isProcessing(design.id)) throw ApiError.conflict('This design is processing. Try again shortly.');

  const result = await segmentDesign(await readImage(design.originalImage), req.body.mode, req.body.segments);
  const variants = await applySegments(design, result, req.user.id);
  res.json({ design, variants });
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
