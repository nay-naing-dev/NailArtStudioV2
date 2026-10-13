/**
 * Estimates a fingernail placement for each finger from MediaPipe's 21 hand landmarks.
 *
 * Landmark indices: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.
 * For each finger the distal segment (DIP -> TIP) gives the direction and scale. The nail sits on
 * the back of that segment, ending just short of the fingertip.
 *
 * Proportions (typical adult hand):
 *   nail length ≈ 0.66 × distal segment length (polish runs to the free edge)
 *   nail width  ≈ 0.75 × finger width, with finger width ≈ index-to-pinky knuckle span / 3
 */

const FINGERS = [
  // Thumbs are usually seen partly side-on, so their nails look narrower than their size suggests.
  { id: 'thumb', tip: 4, dip: 3, width: 1.02, length: 0.6, back: 0.06 },
  { id: 'index', tip: 8, dip: 7, width: 0.97, length: 0.66 },
  { id: 'middle', tip: 12, dip: 11, width: 1.0, length: 0.66 },
  { id: 'ring', tip: 16, dip: 15, width: 0.95, length: 0.66 },
  { id: 'pinky', tip: 20, dip: 19, width: 0.8, length: 0.66 },
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param {Array<{x,y,z}>} hand  normalised landmarks for one hand
 * @param {number} w  image width in px
 * @param {number} h  image height in px
 * @param {string} handIndex  prefix that keeps ids unique across hands
 * @returns {Array<{ id, cx, cy, width, length, angle }>}  angle: radians; rotating (0,-1) by it points at the tip
 */
export function computeNails(hand, w, h, handIndex = 0) {
  const P = (i) => ({ x: hand[i].x * w, y: hand[i].y * h });
  const fingerWidth = dist(P(5), P(17)) / 3;

  return FINGERS.map((f) => {
    const tip = P(f.tip);
    const dip = P(f.dip);
    const seg = Math.max(dist(tip, dip), 1);
    const ux = (tip.x - dip.x) / seg;
    const uy = (tip.y - dip.y) / seg;

    const width = fingerWidth * f.width * 0.75;
    // A finger pointing at the camera foreshortens the segment; never let the nail collapse.
    const length = Math.max(seg * f.length, width * 0.6);
    const back = length * 0.5 + seg * (f.back ?? -0.02); // negative: the free edge reaches just past the tip landmark

    return {
      id: `${handIndex}-${f.id}`,
      finger: f.id,
      cx: tip.x - ux * back,
      cy: tip.y - uy * back,
      width,
      length,
      angle: Math.atan2(ux, -uy),
    };
  });
}

// ---------- refinement against the photo ----------

function makeSampler({ data, width, height }) {
  // Mean RGB of a 3×3 neighbourhood; null outside the image.
  return (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 1 || yi < 1 || xi >= width - 1 || yi >= height - 1) return null;
    let r = 0, g = 0, b = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const o = ((yi + dy) * width + (xi + dx)) * 4;
        r += data[o];
        g += data[o + 1];
        b += data[o + 2];
      }
    }
    return [r / 9, g / 9, b / 9];
  };
}

const colourDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Walks from (x, y) along (dx, dy) and returns the distance to the first clear colour edge
 * (two consecutive samples far from `ref`), or null if none is found within maxDist.
 */
function findEdge(sample, ref, x, y, dx, dy, maxDist, threshold) {
  let misses = 0;
  for (let t = 1; t <= maxDist; t++) {
    const c = sample(x + dx * t, y + dy * t);
    if (!c) return t; // image border counts as an edge
    if (colourDist(c, ref) > threshold) {
      if (++misses === 2) return t - 1;
    } else {
      misses = 0;
    }
  }
  return null;
}

/**
 * Snaps estimated nails to the finger outline in the photo:
 *   - the free edge moves to the fingertip contour, so polish runs to the tip
 *   - the width follows the measured finger width, and the nail is centred across the finger
 * Each correction is clamped, and the landmark estimate is kept when no clear edge is found.
 */
export function refineNails(nails, imageData) {
  const sample = makeSampler(imageData);

  return nails.map((n) => {
    const ux = Math.sin(n.angle); // unit vector toward the tip
    const uy = -Math.cos(n.angle);
    const px = -uy; // across the finger
    const py = ux;
    let { cx, cy, width } = n;
    const { length } = n;

    // Fingertip contour: walk outward from the tip landmark (which lies on skin just inside the
    // fingertip) until the colour changes, i.e. finger meets background. Walking from the nail
    // centre instead stops early at the nail's own free edge and ridges.
    const tipX = cx + ux * length * (0.5 - 0.02); // where computeNails put the free edge
    const tipY = cy + uy * length * (0.5 - 0.02);
    const skin = sample(tipX - ux * 2, tipY - uy * 2);
    if (skin) {
      const threshold = Math.max(40, 0.25 * ((skin[0] + skin[1] + skin[2]) / 3));
      const out = findEdge(sample, skin, tipX, tipY, ux, uy, length * 0.6, threshold);
      if (out != null) {
        const margin = length * 0.07 + 1;
        const shift = clamp(out - margin, -length * 0.15, length * 0.45);
        cx += ux * shift;
        cy += uy * shift;
      }
    }

    // Finger outline across the nail. A higher threshold skips the subtle nail/skin boundary
    // and finds finger vs background.
    const ref = sample(cx, cy);
    if (ref) {
      const threshold = Math.max(55, 0.32 * ((ref[0] + ref[1] + ref[2]) / 3));
      const reach = width * 1.2;
      const left = findEdge(sample, ref, cx, cy, -px, -py, reach, threshold);
      const right = findEdge(sample, ref, cx, cy, px, py, reach, threshold);
      if (left != null && right != null) {
        const finger = left + right;
        if (finger > width * 0.9 && finger < width * 2.2) {
          width = clamp(finger * 0.74, width * 0.8, width * 1.2);
          const offset = (right - left) / 2;
          if (Math.abs(offset) < width * 0.35) {
            cx += px * offset;
            cy += py * offset;
          }
        }
      }
    }

    return { ...n, cx, cy, width };
  });
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Rough check for whether the back of the hand faces the camera (so the nails are visible).
 * Uses the winding of wrist -> index knuckle -> pinky knuckle together with MediaPipe's handedness
 * label (verified against still photos of the backs of both a left and a right hand).
 */
export function isBackOfHand(hand, handedness) {
  const a = { x: hand[5].x - hand[0].x, y: hand[5].y - hand[0].y };
  const b = { x: hand[17].x - hand[0].x, y: hand[17].y - hand[0].y };
  const cross = a.x * b.y - a.y * b.x;
  return handedness === 'Left' ? cross < 0 : cross > 0;
}

/** Applies the user's per-nail and global adjustments to a detected nail. */
export function adjustNail(nail, adj = {}, global = {}) {
  const lengthScale = (global.lengthScale ?? 1) * (adj.lengthScale ?? 1);
  const widthScale = (global.widthScale ?? 1) * (adj.widthScale ?? 1);
  return {
    ...nail,
    cx: nail.cx + (adj.dx ?? 0),
    cy: nail.cy + (adj.dy ?? 0),
    width: nail.width * widthScale,
    length: nail.length * lengthScale,
    angle: nail.angle + ((adj.rotation ?? 0) * Math.PI) / 180,
  };
}

/** True if point (x, y) falls inside the nail's ellipse (with a little slack for small nails). */
export function hitTest(nail, x, y, slack = 1.25) {
  const dx = x - nail.cx;
  const dy = y - nail.cy;
  const cos = Math.cos(-nail.angle);
  const sin = Math.sin(-nail.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return (lx / ((nail.width / 2) * slack)) ** 2 + (ly / ((nail.length / 2) * slack)) ** 2 <= 1;
}
