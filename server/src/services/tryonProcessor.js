import sharp from 'sharp';
import { config } from '../config/env.js';
import { NailDesign } from '../models/NailDesign.js';
import { TryOn } from '../models/TryOn.js';
import { buildInput, downloadOutput, modelName, outputUrl, runPrediction } from './replicate.js';
import { compositeNails } from './tryonComposite.js';
import { deleteImage, readImage, uploadImage } from './storage.js';

/** Describes the design in words, so models that can't see the pattern image still get the idea. */
function describeDesign(design) {
  const parts = [`"${design.title}"`];
  if (design.dominantColor) parts.push(`main colour ${design.dominantColor}`);
  if (design.description) parts.push(design.description.slice(0, 200));
  return parts.join(', ');
}

export function buildPrompt(design, preset = config.replicate.preset) {
  const look = describeDesign(design);
  const realism =
    'A hyper-realistic photograph of the same hand. Seamless nail art with realistic glossy polish, correct lighting, ' +
    'soft shadows, natural reflections, fine detail and a professional nail-art finish.';
  const keep = 'Keep the hand, fingers, skin, jewellery, pose, background and framing exactly as they are. Change only the nails.';
  if (preset === 'multi-image') {
    return (
      `Image 1 is a photo of a hand. Image 2 shows a nail art design (${look}). Image 3 is a black and white mask: white marks the fingernails. ` +
      `Apply the nail design from image 2 to every fingernail marked white in image 3, matching each nail's shape, size and angle. ${realism} ${keep} ` +
      'Return only the edited photo, not the mask.'
    );
  }
  return `${realism} Fingernails painted with the nail art design ${look}. ${keep}`;
}

/** Flattens the design's pattern asset on a neutral background so models don't see black where it's transparent. */
async function loadPattern(design) {
  const wanted = config.replicate.patternSource === 'swatch' ? design.swatchImage : design.isolatedImage;
  const asset = wanted || design.isolatedImage || design.swatchImage;
  if (!asset) return undefined;
  return sharp(await readImage(asset)).flatten({ background: '#e9e6e4' }).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

/**
 * Normalises the customer's upload: EXIF-rotates, downsizes, and resizes the mask to match exactly.
 * Returns the JPEG photo and the 1-channel PNG mask (white = nail), both at the same size.
 */
export async function prepareInputs(photoBuf, maskBuf) {
  const { data, info } = await sharp(photoBuf)
    .rotate()
    .resize({ width: config.tryon.maxPx, height: config.tryon.maxPx, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  const mask = await sharp(maskBuf)
    .resize(info.width, info.height, { fit: 'fill' })
    .greyscale()
    .threshold(128) // strictly black or white
    .png()
    .toBuffer();

  const { channels } = await sharp(mask).stats();
  const whiteShare = channels[0].mean / 255;
  if (whiteShare < 0.0005) throw new Error('The mask is empty: no nails were marked.');
  if (whiteShare > 0.35) throw new Error('The mask covers too much of the photo to be nails.');
  return { photo: data, mask, width: info.width, height: info.height };
}

/**
 * Runs one generation. Called without awaiting; progress is written to the TryOn document.
 * @param {string} tryOnId
 * @param {{ photo: Buffer, mask: Buffer }} raw  the customer's upload (kept in memory only)
 */
export async function processTryOn(tryOnId, raw) {
  try {
    const tryOn = await TryOn.findById(tryOnId);
    if (!tryOn) return;
    tryOn.status = 'processing';
    tryOn.startedAt = new Date();
    tryOn.model = modelName();
    await tryOn.save();

    const design = await NailDesign.findById(tryOn.design);
    if (!design) throw new Error('This design is no longer available.');

    const { photo, mask } = await prepareInputs(raw.photo, raw.mask);
    const pattern = config.replicate.preset === 'inpaint' ? undefined : await loadPattern(design);

    const input = buildInput({ prompt: buildPrompt(design), photo, mask, pattern });
    const prediction = await runPrediction(input, {
      onCreated: (id) => TryOn.updateOne({ _id: tryOnId }, { predictionId: id }).catch(() => {}),
    });

    const generated = await downloadOutput(outputUrl(prediction));
    const finalJpeg = await compositeNails(photo, mask, generated);
    const resultImage = await uploadImage(finalJpeg, { folder: 'tryons', format: 'jpg' });

    await TryOn.updateOne({ _id: tryOnId }, { status: 'succeeded', resultImage, finishedAt: new Date(), $unset: { error: 1 } });
  } catch (err) {
    console.error(`[tryon] ${tryOnId} failed:`, err.message);
    await TryOn.updateOne(
      { _id: tryOnId },
      { status: 'failed', error: String(err.message || 'Generation failed').slice(0, 400), finishedAt: new Date() },
    ).catch(() => {});
  }
}

/** Deletes results (record and file) older than the retention period. */
export async function purgeExpiredTryOns() {
  const cutoff = new Date(Date.now() - config.tryon.retentionDays * 86_400_000);
  const old = await TryOn.find({ createdAt: { $lt: cutoff } });
  for (const t of old) {
    if (t.resultImage) await deleteImage(t.resultImage);
    await t.deleteOne();
  }
  return old.length;
}
