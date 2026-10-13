import sharp from 'sharp';

/**
 * Pastes the AI result back onto the original photo, but only around the nails.
 *
 * Generative models re-render the whole image, which subtly changes skin texture, hand shape, the
 * background and even the person's features. The customer needs to see their own hand, so every pixel
 * outside the (slightly grown, feathered) nail mask is taken from the original photo.
 *
 * @param {Buffer} original  the photo that was sent to the model (JPEG/PNG)
 * @param {Buffer} mask      white = nail, same size as original
 * @param {Buffer} generated the model's output (any size; resized to match the original)
 * @param {{ grow?: number, feather?: number }} [opts]  pixels, relative to the image's longer side
 */
export async function compositeNails(original, mask, generated, { grow = 0.004, feather = 0.0025 } = {}) {
  const { data: orig, info } = await sharp(original).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const long = Math.max(width, height);
  const growPx = Math.max(1, Math.round(long * grow));
  const featherPx = Math.max(0.5, long * feather);

  // Grow the mask (blur then threshold approximates a dilation), then feather its edge.
  const grown = await sharp(mask)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .blur(growPx)
    .threshold(24)
    .blur(featherPx)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const gen = await sharp(generated).rotate().resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();

  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, p = 0; i < grown.length; i++, p += 3) {
    const a = grown[i] / 255;
    out[p] = orig[p] + (gen[p] - orig[p]) * a;
    out[p + 1] = orig[p + 1] + (gen[p + 1] - orig[p + 1]) * a;
    out[p + 2] = orig[p + 2] + (gen[p + 2] - orig[p + 2]) * a;
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
