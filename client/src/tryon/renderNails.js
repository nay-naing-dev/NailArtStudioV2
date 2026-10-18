/**
 * Draws nail-art textures onto a hand photo with lighting matched to the photo.
 *
 * For each nail, working in a local frame where the nail is upright (tip at the top):
 *   1. Sample the photo under the nail: this is the real nail's lighting.
 *   2. Cover-fit the design swatch into the nail rectangle.
 *   3. Per pixel:
 *        exposure = how brightly the bare nail is lit, relative to a typical nail plate
 *        shade    = masked-blurred photo luminance / mean      (multiply-style shading: shadows, contours)
 *        detail   = high-pass of the photo                      (keeps the real nail's texture)
 *        tint     = the photo's ambient colour cast             (white balance)
 *        curve    = darker toward the sides and cuticle        (fakes a curved nail plate)
 *        rim      = slight darkening inside the edge
 *        specular = the photo's own highlights + a gloss streak (screen blend)
 *        alpha    = superellipse nail shape, anti-aliased edge
 *      plus a faint cuticle shadow just outside the base of the nail.
 *   4. Rotate the local tile back into place on the output canvas.
 */

import { DEFAULT_SHAPE, shapeDistance, shapeOutline, shapeWidth } from './nailShapeProfile';

const BARE_NAIL_LUMA = 165; // typical luminance of a bare nail plate in a well-exposed photo
const SATURATION_MATCH = 0.9;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Separable box blur on a Float32 luminance map. */
function boxBlur(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += src[y * w + xx];
          n++;
        }
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}



/**
 * @param {CanvasRenderingContext2D} ctx  output context, already holding the photo
 * @param {HTMLCanvasElement} photo       the unmodified photo (lighting source)
 * @param {object} nail                   { cx, cy, width, length, angle, shape }
 * @param {HTMLImageElement} swatch       design texture
 * @param {object} s                      { opacity, gloss, shading }
 */
export function renderNail(ctx, photo, nail, swatch, s) {
  const shape = nail.shape ?? DEFAULT_SHAPE;
  const nailDistance = (nx, ny) => shapeDistance(shape, nx, ny);
  const W = Math.max(4, Math.round(nail.width));
  const L = Math.max(4, Math.round(nail.length));
  const pad = Math.ceil(Math.max(W, L) * 0.18) + 2;
  const cw = W + pad * 2;
  const ch = L + pad * 2;

  // 1. Photo under the nail, in the nail's local frame
  const patch = makeCanvas(cw, ch);
  const pctx = patch.getContext('2d', { willReadFrequently: true });
  pctx.translate(cw / 2, ch / 2);
  pctx.rotate(-nail.angle);
  pctx.translate(-nail.cx, -nail.cy);
  pctx.drawImage(photo, 0, 0);
  const P = pctx.getImageData(0, 0, cw, ch).data;

  // 2. Swatch, cover-fitted to W × L
  const tile = makeCanvas(cw, ch);
  const tctx = tile.getContext('2d', { willReadFrequently: true });
  const sAspect = swatch.naturalWidth / swatch.naturalHeight;
  const nAspect = W / L;
  let sx = 0, sy = 0, sw = swatch.naturalWidth, sh = swatch.naturalHeight;
  if (sAspect > nAspect) {
    sw = sh * nAspect;
    sx = (swatch.naturalWidth - sw) / 2;
  } else {
    sh = sw / nAspect;
    sy = (swatch.naturalHeight - sh) / 2;
  }
  tctx.drawImage(swatch, sx, sy, sw, sh, pad, pad, W, L);
  const out = tctx.getImageData(0, 0, cw, ch);
  const S = out.data;

  // 3a. Lighting statistics from the photo inside the nail
  const lumMap = new Float32Array(cw * ch);
  const inside = new Float32Array(cw * ch);
  let sumL = 0, sumR = 0, sumG = 0, sumB = 0, count = 0;
  const halfW = W / 2;
  const halfL = L / 2;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const r = P[i * 4], g = P[i * 4 + 1], b = P[i * 4 + 2];
      lumMap[i] = lum(r, g, b);
      if (nailDistance((x - cw / 2) / halfW, (y - ch / 2) / halfL) < 0.92) {
        inside[i] = 1;
        sumL += lumMap[i];
        sumR += r;
        sumG += g;
        sumB += b;
        count++;
      }
    }
  }
  if (!count) return;
  const meanL = Math.max(sumL / count, 1);
  // Ambient colour cast, softened so the design keeps its own colour
  const tintR = ((sumR / count) / meanL) ** 0.3;
  const tintG = ((sumG / count) / meanL) ** 0.3;
  const tintB = ((sumB / count) / meanL) ** 0.3;

  // Broad lighting across the nail. A normalised (masked) blur only averages pixels on the nail,
  // so bright background or skin around a narrow finger doesn't leak in.
  const radius = Math.max(1, Math.round(W / 8));
  const blurNum = boxBlur(lumMap.map((v, i) => v * inside[i]), cw, ch, radius);
  const blurDen = boxBlur(inside, cw, ch, radius);
  const shadeMap = blurNum.map((v, i) => (blurDen[i] > 0.05 ? v / blurDen[i] : meanL));

  // Absolute exposure: a bare nail plate is fairly light, so a dim nail means dim light on the polish too.
  const exposure = clamp(meanL / BARE_NAIL_LUMA, 0.45, 1.15) ** 0.6;
  const specThreshold = meanL * 1.15;

  const edge = 2.2 / Math.min(halfW, halfL); // ~2px anti-aliased edge
  const shading = s.shading ?? 1;
  const gloss = s.gloss ?? 0.6;
  const opacity = s.opacity ?? 1;

  // 3b. Composite each pixel
  for (let y = 0; y < ch; y++) {
    const ny = (y - ch / 2) / halfL;
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const o = i * 4;
      const nx = (x - cw / 2) / halfW;
      const d = nailDistance(nx, ny);

      if (d >= 1) {
        // Cuticle shadow: faint darkening just outside the base of the nail
        const shadow = ny > 0.15 && d < 1.14 ? 0.16 * (1 - (d - 1) / 0.14) * smoothstep(0.15, 0.6, ny) : 0;
        S[o] = S[o + 1] = S[o + 2] = 0;
        S[o + 3] = Math.round(255 * shadow * opacity);
        continue;
      }

      // Lighting = exposure × broad shading × fine detail (ridges and texture of the real nail)
      const shade = clamp(shadeMap[i] / meanL, 0.5, 1.5) ** (0.9 * shading);
      const detail = 1 + clamp((lumMap[i] - shadeMap[i]) / meanL, -0.25, 0.25) * 0.5 * shading;
      // Curved nail plate: falls off toward the sides, darker toward the cuticle
      // (across-the-nail position is taken relative to the shape's local width, so tapered tips shade evenly)
      const side = Math.min(1, Math.abs(nx) / Math.max(shapeWidth(shape, (ny + 1) / 2), 0.25));
      const curve = (1 - 0.34 * side ** 2.2) * (1 - 0.16 * Math.max(0, ny) ** 2.5);
      const rim = 1 - 0.18 * smoothstep(0.82, 1, d);
      const k = (shading > 0 ? exposure : 1) * shade * detail * curve * rim;

      // Specular: the photo's own highlights, plus a crisp gloss streak with a soft halo
      const photoSpec = Math.max(0, lumMap[i] - specThreshold) / Math.max(1, 255 - specThreshold);
      const along = 1 - smoothstep(0.35, 0.85, Math.abs(ny + 0.1));
      const streak =
        (Math.exp(-(((nx + 0.36) / 0.12) ** 2)) * 0.55 + Math.exp(-(((nx + 0.3) / 0.3) ** 2)) * 0.22) * along;
      const spec = clamp((photoSpec * 180 + streak * 140) * gloss, 0, 255);

      let r = clamp(S[o] * k * tintR, 0, 255);
      let g = clamp(S[o + 1] * k * tintG, 0, 255);
      let b = clamp(S[o + 2] * k * tintB, 0, 255);
      // Match the photo's saturation a little so the polish doesn't look pasted on
      const l = lum(r, g, b);
      r = l + (r - l) * SATURATION_MATCH;
      g = l + (g - l) * SATURATION_MATCH;
      b = l + (b - l) * SATURATION_MATCH;

      // Screen blend: highlights brighten without flattening the colour to white
      S[o] = 255 - ((255 - r) * (255 - spec)) / 255;
      S[o + 1] = 255 - ((255 - g) * (255 - spec)) / 255;
      S[o + 2] = 255 - ((255 - b) * (255 - spec)) / 255;
      S[o + 3] = Math.round(255 * smoothstep(0, 1, (1 - d) / edge) * opacity);
    }
  }
  tctx.putImageData(out, 0, 0);

  // 4. Place back on the photo
  ctx.save();
  ctx.translate(nail.cx, nail.cy);
  ctx.rotate(nail.angle);
  ctx.drawImage(tile, -cw / 2, -ch / 2);
  ctx.restore();
}

/** Draws the photo, then every enabled nail. */
export function renderScene(ctx, photo, nails, swatch, settings, { selectedId, showGuides } = {}) {
  ctx.drawImage(photo, 0, 0);
  if (swatch) for (const nail of nails) renderNail(ctx, photo, nail, swatch, settings);

  if (showGuides || selectedId) {
    for (const nail of nails) {
      if (!showGuides && nail.id !== selectedId) continue;
      ctx.save();
      ctx.translate(nail.cx, nail.cy);
      ctx.rotate(nail.angle);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = Math.max(1.5, photo.width / 600);
      ctx.strokeStyle = nail.id === selectedId ? '#c2416b' : 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      shapeOutline(nail.shape ?? DEFAULT_SHAPE, nail.width + 6, nail.length + 6).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}
