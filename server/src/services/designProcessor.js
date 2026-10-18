import { NailDesign } from '../models/NailDesign.js';
import { isolateNails } from './nailIsolation.js';
import { deleteImage, readImage, uploadImage } from './storage.js';
import { config } from '../config/env.js';

const inFlight = new Set();

/**
 * Runs the isolation pipeline for a design and stores the results.
 * Called without awaiting from the controllers: progress is written to `design.processing`.
 *
 * @param {string} designId
 * @param {{ buffer?: Buffer, skinTolerance?: number }} [opts]  buffer defaults to the stored original
 */
export async function processDesign(designId, { buffer, skinTolerance } = {}) {
  if (inFlight.has(String(designId))) return;
  inFlight.add(String(designId));
  const tolerance = skinTolerance ?? config.defaultSkinTolerance;

  try {
    const design = await NailDesign.findById(designId);
    if (!design) return;

    design.processing = { status: 'processing', skinTolerance: tolerance, startedAt: new Date() };
    await design.save();

    const source = buffer ?? (await readImage(design.originalImage));
    const result = await isolateNails(source, { skinTolerance: tolerance });

    const [isolated, swatch] = await Promise.all([
      uploadImage(result.isolatedPng, { folder: 'designs/isolated' }),
      uploadImage(result.swatchPng, { folder: 'designs/swatches' }),
    ]);

    const previous = [design.isolatedImage, design.swatchImage];
    design.isolatedImage = isolated;
    design.swatchImage = swatch;
    design.dominantColor = result.dominantColor;
    design.textureEditedAt = undefined; // a fresh extraction replaces any hand-edited texture
    design.processing = {
      status: 'ready',
      method: result.method,
      skinTolerance: tolerance,
      nailsDetected: result.nailsDetected,
      startedAt: design.processing.startedAt,
      finishedAt: new Date(),
    };
    await design.save();
    await Promise.all(previous.map(deleteImage));
    console.log(`[designs] ${design.id} processed: ${result.nailsDetected} nail(s), bg=${result.method}`);
  } catch (err) {
    console.error(`[designs] processing ${designId} failed:`, err);
    await NailDesign.updateOne(
      { _id: designId },
      {
        $set: {
          'processing.status': 'failed',
          'processing.error': err.message || 'Processing failed',
          'processing.finishedAt': new Date(),
        },
      },
    ).catch(() => {});
  } finally {
    inFlight.delete(String(designId));
  }
}

export const isProcessing = (designId) => inFlight.has(String(designId));
