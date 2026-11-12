/**
 * Paints nail art onto the fixed hand photo used by the home hero.
 *
 * Unlike the general try-on (which has to guess nail shapes from hand landmarks), the hero photo never
 * changes, so its nail plates were fitted by hand and stored in public/hero/hand.json. That lets this
 * renderer be much more faithful:
 *   - each nail is a superellipse matched to the real plate: squared-off tip, rounder cuticle arc;
 *   - the design is wrapped around a cylinder, so patterns compress toward the sidewalls;
 *   - shading is the bare nail's own light falloff from the photo, so it sits in the same light as the skin;
 *   - a clear-coat reflection lands where the real nail already catches the light;
 *   - polish stops a hair short of the cuticle, tucks into the sidewalls, and has a slightly thicker rim.
 * All colour maths runs in linear light.
 */

const toLin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const toSrgb = (c) => {
  c = c < 0 ? 0 : c > 1 ? 1 : c;
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};

/** Separable box blur run three times (≈ Gaussian) over a single-channel buffer. */
function blurGray(src, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/** Bilinear sample of an RGBA texture into linear RGB. */
function sampleLin(tex, tw, th, x, y, out) {
  x = Math.min(tw - 1.001, Math.max(0, x));
  y = Math.min(th - 1.001, Math.max(0, y));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * tw + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + tw * 4;
  const i11 = i01 + 4;
  for (let k = 0; k < 3; k++) {
    const top = toLin[tex[i00 + k]] * (1 - fx) + toLin[tex[i10 + k]] * fx;
    const bot = toLin[tex[i01 + k]] * (1 - fx) + toLin[tex[i11 + k]] * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }
}

/** Tiny deterministic noise, so the polish carries the same grain as the photo. */
const grain = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.012;
};

/**
 * @param ctx      2D context already holding the hand photo (RGBA cut-out)
 * @param light    ImageData of the lighting source (same photo, skin carried past the outline)
 * @param nails    fitted nails from hand.json
 * @param texture  ImageData of the design texture (free edge at the top)
 * @param finish   'gloss' | 'chrome' | 'satin'
 * @param coverage how far the polish reaches, in units of the fitted outline: `side` for the sidewalls and
 *                 free edge, `cuticle` at the base (from hand.json; tighter when the fit is tight)
 */
export function paintNails(ctx, light, nails, texture, finish = 'gloss', coverage = {}) {
  const sideReach = coverage.side ?? 1.045;
  const cuticleReach = coverage.cuticle ?? 1;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const { data: tex, width: tw, height: th } = texture;
  const K = 0.92; // how far round the nail curves (sin of the sidewall angle)
  const asinK = Math.asin(K);
  const specStrength = finish === 'chrome' ? 0.85 : finish === 'satin' ? 0.3 : 0.55;
  const streakWidth = finish === 'chrome' ? 0.3 : 0.16;
  const alb = [0, 0, 0];

  for (const n of nails) {
    const R = Math.ceil(Math.max(n.hw, n.hl) * 1.25);
    const x0 = Math.max(0, Math.floor(n.cx - R));
    const y0 = Math.max(0, Math.floor(n.cy - R));
    const x1 = Math.min(W, Math.ceil(n.cx + R));
    const y1 = Math.min(H, Math.ceil(n.cy + R));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) continue;

    const img = ctx.getImageData(x0, y0, w, h);
    const px = img.data;
    const ca = Math.cos(n.angle);
    const sa = Math.sin(n.angle);
    const onePx = 1 / Math.min(n.hw, n.hl);

    // Light falloff of the bare nail: blurred luminance relative to its mean.
    const lum = new Float32Array(w * h);
    let sum = 0;
    let cnt = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const li = ((y0 + y) * light.width + x0 + x) * 4;
        const L = 0.2126 * toLin[light.data[li]] + 0.7152 * toLin[light.data[li + 1]] + 0.0722 * toLin[light.data[li + 2]];
        lum[y * w + x] = L;
        const dx = x0 + x - n.cx;
        const dy = y0 + y - n.cy;
        const u = (dx * ca + dy * sa) / n.hw;
        const v = (dx * sa - dy * ca) / n.hl;
        if (u * u + v * v < 0.6) {
          sum += L;
          cnt++;
        }
      }
    }
    const lowLum = blurGray(lum, w, h, n.hw * 0.35);
    const meanLum = cnt ? sum / cnt : 0.5;

    // Texture cover-fit onto the unrolled nail.
    const aspect = (n.hw * 2 * (asinK / K)) / (n.hl * 2);
    let sw = tw;
    let sh = tw / aspect;
    if (tw / th > aspect) {
      sw = th * aspect;
      sh = th;
    }
    const ox = (tw - sw) / 2;
    const oy = (th - sh) / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x0 + x - n.cx;
        const dy = y0 + y - n.cy;
        const u = (dx * ca + dy * sa) / n.hw; // across the nail
        const v = (dx * sa - dy * ca) / n.hl; // toward the free edge (+1)
        const e = v > 0 ? n.tipRound : n.baseRound;
        const r = (Math.abs(u) ** e + Math.abs(v) ** e) ** (1 / e); // 1 on the plate outline

        // How much of the nail plate this is: reaches into the sidewalls, a hairline short of the cuticle.
        const toCuticle = smooth((-0.3 - v) / 0.5);
        const reach = sideReach * (1 - toCuticle) + (cuticleReach - 1.2 * onePx) * toCuticle;
        const cover = clamp01((reach - r) / (1.4 * onePx));
        const i = (y * w + x) * 4;

        // Soft shadow on the skin right at the cuticle line.
        const shadow = clamp01(1 - Math.abs(r - 1) / 0.05) * toCuticle * 0.15;
        if (cover <= 0) {
          if (shadow > 0 && px[i + 3] > 0) for (let k = 0; k < 3; k++) px[i + k] = toSrgb(toLin[px[i + k]] * (1 - shadow));
          continue;
        }

        const uc = u < -1 ? -1 : u > 1 ? 1 : u;
        const theta = Math.asin(uc * K);
        const su = theta / asinK; // arc position: compresses the pattern toward the sides
        sampleLin(tex, tw, th, ox + ((su + 1) / 2) * sw, oy + ((1 - v) / 2) * sh, alb);

        const rel = Math.min(1.2, Math.max(0.75, lowLum[y * w + x] / (meanLum + 1e-4)));
        const endDark = 1 - (0.1 * clamp01(Math.abs(v) - 0.6)) / 0.4;
        const diffuse = rel * Math.cos(theta) ** 0.8 * endDark;
        const rim = 1 - 0.22 * clamp01((r - 0.88) / 0.16) ** 2;

        // Clear-coat reflection: a window streak where the bare nail is brightest, plus a faint sheen.
        const streak = smooth(1 - Math.abs(u - n.highlightU) / streakWidth);
        const along = clamp01((0.74 - Math.abs(v - 0.1)) / 0.3) * (0.85 + 0.15 * Math.cos(v * 7));
        const sheen = 0.1 * Math.exp(-(((u + n.highlightU * 0.8) / 0.35) ** 2)) * clamp01(v + 0.2);
        const spec = streak * along * specStrength + sheen;
        const g = grain(x0 + x, y0 + y);

        for (let k = 0; k < 3; k++) {
          let c;
          if (finish === 'chrome') {
            const band = 0.5 + 0.5 * Math.cos((su * 2.2 + 0.3) * Math.PI);
            c = alb[k] * (0.35 + 0.95 * band * rel) + alb[k] * spec * 1.6;
          } else {
            c = alb[k] * diffuse * rim + spec;
          }
          const skin = toLin[px[i + k]] * (1 - shadow);
          px[i + k] = toSrgb(skin * (1 - cover) + (c + g) * cover);
        }
      }
    }
    ctx.putImageData(img, x0, y0);
  }
}
