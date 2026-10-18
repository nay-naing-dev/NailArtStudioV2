/**
 * Nail shape templates for the try-on engine.
 *
 * A shape is a half-width profile w(t) along the nail, where t runs from 0 at the free edge (tip) to 1 at the
 * cuticle and w is 0..1 of the nail's full width. Both the instant-preview renderer and the AI mask are built from
 * the same profile, so what the customer previews is exactly what gets generated.
 */

export const NAIL_SHAPES = ['Almond', 'Square', 'Coffin', 'Stiletto', 'Oval', 'Round'];
export const DEFAULT_SHAPE = 'Oval';

// Length of each shape relative to the detected nail. Longer shapes extend past the fingertip (like extensions).
const LENGTH_SCALE = { Almond: 1.22, Square: 1.06, Coffin: 1.2, Stiletto: 1.4, Oval: 1.1, Round: 1 };

// Rounded cuticle end, shared by every shape.
const base = (t) => (t > 0.84 ? Math.sqrt(Math.max(0, 1 - ((t - 0.84) / 0.16) ** 2)) : 1);

// Superellipse-style rise from the tip: 0 at t=0, 1 at t=c. p=2 is elliptical, p=1 is a straight taper.
const rise = (t, c, p) => (t >= c ? 1 : (1 - ((c - t) / c) ** p) ** (1 / p));

const PROFILES = {
  Round: (t) => rise(t, 0.5, 2),
  Oval: (t) => rise(t, 0.62, 2),
  Square: (t) => rise(t, 0.07, 3),
  Almond: (t) => rise(t, 0.9, 1.55),
  Stiletto: (t) => rise(t, 0.95, 1.05),
  // Straight taper to a flat tip, with softened corners
  Coffin: (t) => {
    if (t >= 0.6) return 1;
    const flat = 0.6;
    const edge = 0.04;
    if (t >= edge) return flat + (1 - flat) * ((t - edge) / (0.6 - edge));
    return flat * rise(t, edge, 2);
  },
};

/** Half-width (0..1) of the shape at position t along the nail. */
export const shapeWidth = (shape, t) => (PROFILES[shape] ?? PROFILES[DEFAULT_SHAPE])(t) * base(t);

/**
 * "Distance" of a point from the shape's outline, in the nail's normalised frame
 * (nx across, -1..1; ny along, -1 at the tip to +1 at the cuticle). Below 1 is inside.
 */
export function shapeDistance(shape, nx, ny) {
  const t = (ny + 1) / 2;
  if (t < 0) return 1 - t * 4;
  if (t > 1) return 1 + (t - 1) * 4;
  return Math.abs(nx) / Math.max(shapeWidth(shape, t), 0.001);
}

/** Outline points (in nail-local pixels, tip at -y) for drawing the shape on a canvas path. */
export function shapeOutline(shape, width, length, steps = 48) {
  const right = [];
  const left = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = (t * 2 - 1) * (length / 2);
    const x = shapeWidth(shape, t) * (width / 2);
    right.push([x, y]);
    left.push([-x, y]);
  }
  return [...right, ...left.reverse()];
}

/** Gives a detected nail the chosen shape: extends the free edge for longer shapes, keeping the cuticle fixed. */
export function applyShape(nail, shape = DEFAULT_SHAPE) {
  const m = LENGTH_SCALE[shape] ?? 1;
  const extra = nail.length * (m - 1);
  const ux = Math.sin(nail.angle); // unit vector toward the tip
  const uy = -Math.cos(nail.angle);
  return {
    ...nail,
    shape,
    length: nail.length + extra,
    cx: nail.cx + (ux * extra) / 2,
    cy: nail.cy + (uy * extra) / 2,
  };
}
