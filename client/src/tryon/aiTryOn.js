import { tryonApi } from '../lib/api';
import { DEFAULT_SHAPE, shapeOutline } from './nailShapeProfile';

/**
 * Black and white nail mask (white = nail), the same size as `photo`.
 * Uses the same nail shape as the instant preview, including the customer's drags, resizes and hidden nails.
 */
export function buildMaskCanvas(photo, nails) {
  const canvas = document.createElement('canvas');
  canvas.width = photo.width;
  canvas.height = photo.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (const n of nails) {
    ctx.save();
    ctx.translate(n.cx, n.cy);
    ctx.rotate(n.angle);
    // The chosen nail shape, exactly as drawn by the instant preview (renderNails.js)
    ctx.beginPath();
    shapeOutline(n.shape ?? DEFAULT_SHAPE, n.width, n.length).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return canvas;
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));

/** Uploads the photo and mask, then polls until the generation finishes. */
export async function generateTryOn({ photo, nails, designId, onStatus, signal }) {
  const mask = buildMaskCanvas(photo, nails);
  const form = new FormData();
  form.append('designId', designId);
  form.append('photo', await toBlob(photo, 'image/jpeg', 0.9), 'photo.jpg');
  form.append('mask', await toBlob(mask, 'image/png'), 'mask.png');

  let tryOn = await tryonApi.create(form);
  onStatus?.(tryOn.status);
  const started = Date.now();
  while (!['succeeded', 'failed'].includes(tryOn.status)) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (Date.now() - started > 4 * 60_000) throw new Error('This is taking too long. Please try again.');
    await new Promise((r) => setTimeout(r, 2000));
    tryOn = await tryonApi.get(tryOn.id);
    onStatus?.(tryOn.status);
  }
  if (tryOn.status === 'failed') throw new Error(tryOn.error || 'Generation failed');
  return tryOn;
}
