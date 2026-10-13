import sharp from 'sharp';
import { removeBackground } from './backgroundRemoval.js';

/**
 * Nail design isolation pipeline.
 *
 *   reference photo
 *     -> normalise (EXIF rotation, max 1024px)
 *     -> background removal (imgly / Cloudinary / none)      : hand and nails remain
 *     -> adaptive skin model in YCrCb, then remove skin       : nails remain
 *     -> morphological open/close                            : speckle removed, highlight holes filled
 *     -> connected components + shape filters                : one blob per nail
 *     -> isolated.png (all nails, transparent)
 *        swatch.png   (largest nail, rotated upright, inset-cropped to an opaque texture)
 */

const MAX_DIM = 1024;
const SWATCH_MAX_H = 384;
const SWATCH_INSET = 0.16; // fraction trimmed from each side so the swatch has no nail edge or skin
const MAX_ELONGATION = 4; // even long stiletto nails stay under this; slivers between fingers don't
const MIN_SKIN_ADJACENCY = 0.2; // share of a nail's outline that must border skin
const MAX_SIZE_RATIO = 8; // reject regions over 8x the median candidate area
// How far toward neutral grey the skin boundary is pulled (0 = off, 0.5 = halfway). Rescues white,
// grey and silver nails; set higher and very pale skin starts to read as "not skin".
const NEUTRAL_GUARD = 0.25;
// A region is skin if more than MAX_SKIN_FRACTION of its pixels are within SKIN_PIXEL_Z robust
// std-devs of the skin median (catches knuckles and highlights that slipped past the pixel test).
const SKIN_PIXEL_Z = 1.5;
const MAX_SKIN_FRACTION = 0.5;
// Neutral regions (|Cr-128| and |Cb-128| within NEUTRAL_CHROMA) bigger than MAX_NEUTRAL_AREA of the
// image are treated as fabric or wall. A white nail touching white fabric is lost with it.
const NEUTRAL_CHROMA = 8;
const MAX_NEUTRAL_AREA = 0.04;

export class IsolationError extends Error {}

// ---------- colour helpers ----------

function toYCrCb(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return [y, (r - y) * 0.713 + 128, (b - y) * 0.564 + 128];
}

// Deliberately broad first pass. The adaptive model below narrows it to *this* person's skin.
function isSkinCandidate(r, g, b, y, cr, cb) {
  return y > 45 && cr >= 133 && cr <= 180 && cb >= 75 && cb <= 132 && r > g && r > b && r - Math.min(g, b) > 12;
}

function histMedian(hist, total) {
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc * 2 >= total) return i;
  }
  return hist.length - 1;
}

function robustStats(hist, total) {
  const median = histMedian(hist, total);
  const dev = new Uint32Array(256);
  for (let i = 0; i < 256; i++) if (hist[i]) dev[Math.abs(i - median)] += hist[i];
  const mad = histMedian(dev, total);
  return { median, sigma: Math.max(2.5, 1.4826 * mad) };
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// ---------- binary morphology (square kernel, prefix sums) ----------

function windowCounts(mask, w, h, r) {
  const horiz = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) sum += mask[row + x];
    for (let x = 0; x < w; x++) {
      horiz[row + x] = sum;
      const add = x + r + 1;
      const sub = x - r;
      if (add < w) sum += mask[row + add];
      if (sub >= 0) sum -= mask[row + sub];
    }
  }
  const out = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) sum += horiz[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum;
      const add = y + r + 1;
      const sub = y - r;
      if (add < h) sum += horiz[add * w + x];
      if (sub >= 0) sum -= horiz[sub * w + x];
    }
  }
  return out;
}

function dilate(mask, w, h, r) {
  const c = windowCounts(mask, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = c[i] > 0 ? 1 : 0;
  return out;
}

function erode(mask, w, h, r) {
  const c = windowCounts(mask, w, h, r);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const spanY = Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1;
    for (let x = 0; x < w; x++) {
      const spanX = Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1;
      out[y * w + x] = c[y * w + x] === spanX * spanY ? 1 : 0;
    }
  }
  return out;
}

// ---------- connected components (4-connectivity) ----------

function labelComponents(mask, w, h, rgb) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = comps.length + 1;
    const c = { id, area: 0, minX: w, minY: h, maxX: 0, maxY: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, r: 0, g: 0, b: 0 };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      c.sx += x;
      c.sy += y;
      c.sxx += x * x;
      c.syy += y * y;
      c.sxy += x * y;
      c.r += rgb[p * 4];
      c.g += rgb[p * 4 + 1];
      c.b += rgb[p * 4 + 2];
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) (labels[p - 1] = id), (stack[sp++] = p - 1);
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) (labels[p + 1] = id), (stack[sp++] = p + 1);
      if (y > 0 && mask[p - w] && !labels[p - w]) (labels[p - w] = id), (stack[sp++] = p - w);
      if (y < h - 1 && mask[p + w] && !labels[p + w]) (labels[p + w] = id), (stack[sp++] = p + w);
    }
    c.bordersTouched = (c.minX === 0) + (c.minY === 0) + (c.maxX === w - 1) + (c.maxY === h - 1);
    comps.push(c);
  }
  return { labels, comps };
}

/** Central second moments and principal axis angle (radians, from +x towards +y). */
function moments(c) {
  const cx = c.sx / c.area;
  const cy = c.sy / c.area;
  const mu20 = c.sxx / c.area - cx * cx;
  const mu02 = c.syy / c.area - cy * cy;
  const mu11 = c.sxy / c.area - cx * cy;
  return { mu20, mu02, mu11, theta: 0.5 * Math.atan2(2 * mu11, mu20 - mu02) };
}

/** Major/minor axis ratio of the component's equivalent ellipse. */
function elongation(c) {
  const { mu20, mu02, mu11 } = moments(c);
  const common = Math.sqrt(4 * mu11 * mu11 + (mu20 - mu02) ** 2);
  const l1 = (mu20 + mu02 + common) / 2;
  const l2 = (mu20 + mu02 - common) / 2;
  return l2 <= 0 ? Infinity : Math.sqrt(l1 / l2);
}

/**
 * Share of each component's pixels whose chroma lies close to the skin median. (Average colour is
 * not enough: a region that merged a gold and a navy nail averages out to a skin tone.)
 */
function measureSkinFraction(comps, labels, cr, cb, model) {
  const skin = new Float64Array(comps.length + 1);
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i];
    if (!id) continue;
    const z = Math.hypot((cr[i] - model.cr.median) / model.cr.sigma, (cb[i] - model.cb.median) / model.cb.sigma);
    if (z < SKIN_PIXEL_Z) skin[id]++;
  }
  for (const c of comps) c.skinFraction = skin[c.id] / c.area;
}

/**
 * For each component, the share of its outline that borders skin (as opposed to background or other
 * non-skin foreground). Nails sit on fingers, so a good part of their outline touches skin; sleeves,
 * clothing and props are framed mostly by background. Probes `dist` px outside each boundary pixel,
 * past the band that morphology may have shifted.
 */
function measureSkinAdjacency(comps, labels, skinMask, w, h, dist) {
  const skin = new Float64Array(comps.length + 1);
  const total = new Float64Array(comps.length + 1);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = labels[y * w + x];
      if (!id) continue;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || labels[ny * w + nx] === id) continue;
        const px = Math.min(w - 1, Math.max(0, x + dx * dist));
        const py = Math.min(h - 1, Math.max(0, y + dy * dist));
        const j = py * w + px;
        if (labels[j] === id) continue;
        total[id]++;
        if (skinMask[j]) skin[id]++;
      }
    }
  }
  for (const c of comps) c.skinAdjacency = total[c.id] ? skin[c.id] / total[c.id] : 0;
}

// ---------- main pipeline ----------

/**
 * @param {Buffer} input  any image format sharp can read
 * @param {object} [opts]
 * @param {number} [opts.skinTolerance=2.5]  skin model width in robust std-devs; 0 turns skin removal off
 * @param {number} [opts.maxNails=10]
 * @param {boolean} [opts.debug=false]  also return intermediate masks and per-component decisions
 */
export async function isolateNails(input, { skinTolerance = 2.5, maxNails = 10, debug = false } = {}) {
  // 1. Normalise
  const normalized = await sharp(input)
    .rotate()
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = normalized.info;
  const n = w * h;
  const orig = await sharp(normalized.data).ensureAlpha().raw().toBuffer();

  // 2. Background removal (alpha channel only; colours come from the original)
  const { buffer: cutout, method } = await removeBackground(normalized.data);
  const cut = await sharp(cutout).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

  // 3. Adaptive skin model
  const fg = new Uint8Array(n);
  const cr = new Uint8Array(n);
  const cb = new Uint8Array(n);
  const crHist = new Uint32Array(256);
  const cbHist = new Uint32Array(256);
  let fgCount = 0;
  let candCount = 0;
  for (let i = 0; i < n; i++) {
    if (cut[i * 4 + 3] < 128) continue;
    fg[i] = 1;
    fgCount++;
    const r = orig[i * 4], g = orig[i * 4 + 1], b = orig[i * 4 + 2];
    const [y, vCr, vCb] = toYCrCb(r, g, b);
    cr[i] = Math.max(0, Math.min(255, Math.round(vCr)));
    cb[i] = Math.max(0, Math.min(255, Math.round(vCb)));
    if (isSkinCandidate(r, g, b, y, vCr, vCb)) {
      crHist[cr[i]]++;
      cbHist[cb[i]]++;
      candCount++;
    }
  }
  if (fgCount < n * 0.005) throw new IsolationError('Background removal left nothing in the image.');

  const skinRemoved = skinTolerance > 0 && candCount >= fgCount * 0.03;
  const mask = new Uint8Array(n);
  const skinMask = new Uint8Array(n); // pixels classified as skin (not merely removed from mask)
  let skinModel = null;
  if (skinRemoved) {
    const sCr = robustStats(crHist, candCount);
    const sCb = robustStats(cbHist, candCount);
    skinModel = { cr: sCr, cb: sCb };
    const tCr = skinTolerance * sCr.sigma;
    const tCb = skinTolerance * sCb.sigma;
    // Neutral guard: skin is always warmer than grey (Cr > 128, Cb < 128). Very pale skin sits close
    // to neutral, which would make the skin range swallow white, grey and silver nails. Only call a
    // pixel skin if it is closer to the skin median than to neutral on both chroma axes.
    const crFloor = 128 + (sCr.median - 128) * NEUTRAL_GUARD;
    const cbCeil = 128 - (128 - sCb.median) * NEUTRAL_GUARD;
    for (let i = 0; i < n; i++) {
      if (!fg[i]) continue;
      const isSkin =
        Math.abs(cr[i] - sCr.median) <= tCr &&
        Math.abs(cb[i] - sCb.median) <= tCb &&
        cr[i] > crFloor &&
        cb[i] < cbCeil;
      mask[i] = isSkin ? 0 : 1;
      skinMask[i] = isSkin ? 1 : 0;
    }
  } else {
    mask.set(fg);
  }

  // Large neutral (white/grey) areas left in the mask are fabric or wall, e.g. a white sleeve behind
  // the hand. Remove them so coloured nails resting on them don't merge into one huge region.
  let fabricRemoved = 0;
  if (skinRemoved) {
    const neutral = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (mask[i] && Math.abs(cr[i] - 128) <= NEUTRAL_CHROMA && Math.abs(cb[i] - 128) <= NEUTRAL_CHROMA) neutral[i] = 1;
    }
    const { labels: nLabels, comps: nComps } = labelComponents(neutral, w, h, orig);
    const fabric = new Set(nComps.filter((c) => c.area > n * MAX_NEUTRAL_AREA).map((c) => c.id));
    if (fabric.size) {
      for (let i = 0; i < n; i++) {
        if (fabric.has(nLabels[i])) {
          mask[i] = 0;
          fabricRemoved++;
        }
      }
    }
  }

  // 4. Morphology. Close first so textured nails (foil, glitter, highlights that read as skin) become
  // solid blobs, then open to drop speckle and thin slivers along finger edges.
  const rad = Math.max(1, Math.round(Math.min(w, h) / 300));
  let clean = erode(dilate(mask, w, h, rad), w, h, rad);
  clean = dilate(erode(clean, w, h, rad), w, h, rad);

  // 5. Components -> nails
  const { labels, comps } = labelComponents(clean, w, h, orig);
  const minArea = Math.max(60, n * 0.0015);
  if (skinRemoved) {
    measureSkinAdjacency(comps, labels, skinMask, w, h, rad * 3);
    measureSkinFraction(comps, labels, cr, cb, skinModel);
  }
  const rejectReason = (c) =>
    c.area < minArea ? 'too small'
    : c.area >= n * 0.5 ? 'too large'
    : c.bordersTouched >= 2 ? 'touches image borders'
    : elongation(c) > MAX_ELONGATION ? 'too elongated'
    : skinRemoved && c.skinAdjacency < MIN_SKIN_ADJACENCY ? 'not on a finger (mostly framed by background)'
    : skinRemoved && c.skinFraction > MAX_SKIN_FRACTION ? 'mostly skin-coloured (knuckle, highlight or ring)'
    : null;
  const candidates = comps.filter((c) => !rejectReason(c));
  // Nails in one photo are roughly the same size. Anything far bigger than the typical candidate is
  // clothing, a sleeve or background that survived (common with white or grey fabric).
  const byArea = candidates.map((c) => c.area).sort((a, b) => a - b);
  const typicalArea = byArea[Math.floor((byArea.length - 1) / 2)] ?? 0;
  const oversized = new Set(candidates.filter((c) => c.area > typicalArea * MAX_SIZE_RATIO));
  let nails = candidates.filter((c) => !oversized.has(c)).sort((a, b) => b.area - a.area);
  if (nails.length) nails = nails.filter((c) => c.area >= nails[0].area * 0.12).slice(0, maxNails);
  const finalReason = (c) =>
    rejectReason(c) ??
    (oversized.has(c) ? 'much larger than the other nails (clothing or background?)'
    : nails.includes(c) ? null
    : 'much smaller than the largest nail, or over the nail limit');
  const debugInfo = debug && {
    width: w,
    height: h,
    skinModel,
    fabricRemoved,
    masks: { foreground: fg, notSkin: mask, cleaned: clean },
    components: comps
      .filter((c) => c.area >= 30)
      .map((c) => ({
        id: c.id,
        area: c.area,
        bbox: [c.minX, c.minY, c.maxX, c.maxY],
        elongation: +elongation(c).toFixed(2),
        skinAdjacency: c.skinAdjacency != null ? +c.skinAdjacency.toFixed(2) : null,
        skinFraction: c.skinFraction != null ? +c.skinFraction.toFixed(2) : null,
        kept: nails.includes(c),
        reason: finalReason(c),
      })),
  };
  if (!nails.length) {
    throw new IsolationError(
      'No nail regions found. Try a clearer photo, or reprocess with a different skin tolerance.',
    );
  }

  // 6. Isolated PNG of every kept nail, with feathered alpha
  const keepIds = new Set(nails.map((c) => c.id));
  const keep = Buffer.alloc(n);
  for (let i = 0; i < n; i++) if (keepIds.has(labels[i])) keep[i] = 255;
  // extractChannel(0) is required: sharp otherwise outputs the 1-channel mask as 3-channel sRGB.
  const feathered = await sharp(keep, { raw: { width: w, height: h, channels: 1 } })
    .blur(1.2)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const isoRaw = Buffer.from(orig);
  for (let i = 0; i < n; i++) isoRaw[i * 4 + 3] = feathered[i];

  const pad = 8;
  const ux0 = Math.max(0, Math.min(...nails.map((c) => c.minX)) - pad);
  const uy0 = Math.max(0, Math.min(...nails.map((c) => c.minY)) - pad);
  const ux1 = Math.min(w - 1, Math.max(...nails.map((c) => c.maxX)) + pad);
  const uy1 = Math.min(h - 1, Math.max(...nails.map((c) => c.maxY)) + pad);
  const isolatedPng = await sharp(isoRaw, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: ux0, top: uy0, width: ux1 - ux0 + 1, height: uy1 - uy0 + 1 })
    .png()
    .toBuffer();

  // Dominant colour across all nails
  const tot = nails.reduce((s, c) => s + c.area, 0);
  const dominantColor = toHex(
    nails.reduce((s, c) => s + c.r, 0) / tot,
    nails.reduce((s, c) => s + c.g, 0) / tot,
    nails.reduce((s, c) => s + c.b, 0) / tot,
  );

  // 7. Swatch from the largest region that looks like a single nail. Two touching nails can merge
  // into one region about twice the typical size; skip those so the texture isn't two half-nails.
  const keptAreas = nails.map((c) => c.area).sort((a, b) => a - b);
  const medianKept = keptAreas[Math.floor((keptAreas.length - 1) / 2)];
  const swatchSource = nails.find((c) => c.area <= medianKept * 1.5 && elongation(c) <= 3) ?? nails[0];
  const swatchPng = await buildSwatch(orig, labels, w, swatchSource, dominantColor);

  return { isolatedPng, swatchPng, dominantColor, method, nailsDetected: nails.length, skinRemoved, debug: debugInfo || undefined };
}

async function buildSwatch(orig, labels, w, c, dominantColor) {
  const bw = c.maxX - c.minX + 1;
  const bh = c.maxY - c.minY + 1;
  const crop = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const src = (c.minY + y) * w + (c.minX + x);
      const dst = (y * bw + x) * 4;
      if (labels[src] !== c.id) continue;
      crop[dst] = orig[src * 4];
      crop[dst + 1] = orig[src * 4 + 1];
      crop[dst + 2] = orig[src * 4 + 2];
      crop[dst + 3] = 255;
    }
  }

  // Principal axis from second-order central moments; rotate so the long axis is vertical.
  const thetaDeg = (moments(c).theta * 180) / Math.PI;
  const rotation = 90 - thetaDeg; // sharp rotates clockwise for positive angles (y axis points down)

  const rotated = await sharp(crop, { raw: { width: bw, height: bh, channels: 4 } })
    .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: rw, height: rh } = rotated.info;
  const rd = rotated.data;

  let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (rd[(y * rw + x) * 4 + 3] < 250) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new IsolationError('Could not build a texture swatch from the detected nail.');

  const iw = x1 - x0 + 1;
  const ih = y1 - y0 + 1;
  const insetX = Math.floor(iw * SWATCH_INSET);
  const insetY = Math.floor(ih * SWATCH_INSET);
  const ex = { left: x0 + insetX, top: y0 + insetY, width: Math.max(4, iw - 2 * insetX), height: Math.max(4, ih - 2 * insetY) };
  ex.width = Math.min(ex.width, rw - ex.left);
  ex.height = Math.min(ex.height, rh - ex.top);

  return sharp(rd, { raw: { width: rw, height: rh, channels: 4 } })
    .extract(ex)
    .flatten({ background: dominantColor }) // fill any leftover transparent pixels at the edges
    .resize({ height: SWATCH_MAX_H, withoutEnlargement: false })
    .png()
    .toBuffer();
}
