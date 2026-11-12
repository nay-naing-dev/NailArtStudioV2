import sharp from 'sharp';
import { FINGERS } from '../models/NailDesign.js';
import { ApiError } from '../utils/ApiError.js';
import { uploadImage } from './storage.js';

/**
 * Turns the boxes an admin drew in the segmenter into stored try-on textures.
 *
 * Boxes are fractions of the EXIF-rotated original, which is exactly what the browser shows, so the crop lands on
 * the same pixels the admin saw. Crops come from the full-resolution original for the sharpest textures.
 *
 *   single:  one box -> opaque upright texture resized to the standard 2:3 nail aspect
 *   set:     one box per finger -> fingerImages; 'variation' boxes -> separate standalone designs
 *   pattern: one box -> flat swatch, tiled by the try-on renderer
 */

const NAIL_ASPECT = 2 / 3; // width / height of a typical nail, tip at the top
const NAIL_MAX_H = 512;
const PATTERN_MAX = 768;
const MIN_CROP_PX = 12;

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Upright, opaque crop of one box, as a raw-ish PNG buffer at source resolution. */
async function cropBox(source, { width: W, height: H }, { box, turn = 0 }) {
  const left = Math.min(W - 1, Math.max(0, Math.round(box.x * W)));
  const top = Math.min(H - 1, Math.max(0, Math.round(box.y * H)));
  const width = Math.min(W - left, Math.round(box.width * W));
  const height = Math.min(H - top, Math.round(box.height * H));
  if (width < MIN_CROP_PX || height < MIN_CROP_PX) {
    throw ApiError.badRequest(`A box is too small (${width}×${height}px). Zoom in and draw it around the whole nail.`);
  }
  // Two steps on purpose: sharp would otherwise apply the rotation before the extract.
  const piece = await sharp(source).extract({ left, top, width, height }).toBuffer();
  return sharp(piece).rotate(turn).flatten({ background: '#ffffff' }).png().toBuffer();
}

const nailTexture = (png, { standardAspect }) =>
  sharp(png)
    .resize(
      standardAspect
        ? { width: Math.round(NAIL_MAX_H * NAIL_ASPECT), height: NAIL_MAX_H, fit: 'cover' }
        : { height: NAIL_MAX_H, fit: 'inside', withoutEnlargement: false },
    )
    .png()
    .toBuffer();

const patternTexture = (png) =>
  sharp(png).resize({ width: PATTERN_MAX, height: PATTERN_MAX, fit: 'inside', withoutEnlargement: true }).png().toBuffer();

async function meanColor(buffers) {
  const means = await Promise.all(buffers.map(async (b) => (await sharp(b).stats()).channels.slice(0, 3).map((c) => c.mean)));
  const avg = [0, 1, 2].map((i) => means.reduce((s, m) => s + m[i], 0) / means.length);
  return toHex(...avg);
}

/**
 * @param {Buffer} original  the uploaded or stored reference photo
 * @param {'single'|'set'|'pattern'} mode
 * @param {Array<{ role, box, turn, label? }>} segments  already validated
 * @returns {Promise<{
 *   designType, swatchImage, fingerImages?, dominantColor, segments,
 *   variations: Array<{ label?, originalImage, swatchImage, dominantColor, segment }>
 * }>}  every asset is already uploaded; the caller owns them from here
 */
export async function segmentDesign(original, mode, segments) {
  const source = await sharp(original).rotate().toBuffer(); // apply EXIF orientation, like the browser does
  const meta = await sharp(source).metadata();
  const crops = await Promise.all(segments.map((s) => cropBox(source, meta, s)));

  if (mode === 'single' || mode === 'pattern') {
    const texture = mode === 'single' ? await nailTexture(crops[0], { standardAspect: true }) : await patternTexture(crops[0]);
    return {
      designType: mode,
      swatchImage: await uploadImage(texture, { folder: mode === 'single' ? 'designs/swatches' : 'designs/patterns' }),
      dominantColor: await meanColor([texture]),
      segments: segments.map(({ role, box, turn }) => ({ role, box, turn })),
      variations: [],
    };
  }

  // Full set. Textures keep the proportions of each box: a thumb is wider than a pinky.
  const textures = await Promise.all(crops.map((c) => nailTexture(c, { standardAspect: false })));
  const fingerIdx = segments.map((s, i) => (FINGERS.includes(s.role) ? i : -1)).filter((i) => i >= 0);
  const variationIdx = segments.map((s, i) => (s.role === 'variation' ? i : -1)).filter((i) => i >= 0);

  const variations = await Promise.all(
    variationIdx.map(async (i) => {
      const reference = await sharp(crops[i]).jpeg({ quality: 90 }).toBuffer();
      const [originalImage, swatchImage, dominantColor] = await Promise.all([
        uploadImage(reference, { folder: 'designs/originals', format: 'jpg' }),
        uploadImage(textures[i], { folder: 'designs/swatches' }),
        meanColor([textures[i]]),
      ]);
      // The variation's own original is this crop, so its box covers the whole photo.
      const segment = { role: 'texture', box: { x: 0, y: 0, width: 1, height: 1 }, turn: segments[i].turn };
      const inParent = { role: 'texture', box: segments[i].box, turn: segments[i].turn };
      return { label: segments[i].label, originalImage, swatchImage, dominantColor, segment, inParent };
    }),
  );

  // Only variations: the design itself becomes the first one, and the rest are split out.
  if (!fingerIdx.length) {
    const [first, ...rest] = variations;
    return {
      designType: 'single',
      swatchImage: first.swatchImage,
      dominantColor: first.dominantColor,
      segments: [first.inParent],
      variations: rest,
      unusedOriginal: first.originalImage, // the caller deletes it; the design keeps its full photo
    };
  }

  const uploads = await Promise.all(fingerIdx.map((i) => uploadImage(textures[i], { folder: 'designs/sets' })));
  const fingerImages = Object.fromEntries(fingerIdx.map((i, k) => [segments[i].role, uploads[k]]));
  // The fallback texture (thumbnails, bookings, fingers without their own art): the middle nail, else the first one drawn.
  const primary = fingerImages.middle ?? uploads[0];

  return {
    designType: 'set',
    fingerImages,
    swatchImage: primary,
    dominantColor: await meanColor(fingerIdx.map((i) => textures[i])),
    segments: fingerIdx.map((i) => ({ role: segments[i].role, box: segments[i].box, turn: segments[i].turn })),
    variations,
  };
}
