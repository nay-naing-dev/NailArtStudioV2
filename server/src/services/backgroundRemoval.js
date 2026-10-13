import { cloudinary, cloudinaryEnabled } from '../config/cloudinary.js';
import { config } from '../config/env.js';

/**
 * Removes the background from a PNG buffer and returns { buffer, method } with a transparent PNG.
 * The hand stays in the result: background removers treat it as foreground.
 * Skin is removed later in nailIsolation.js.
 */

let imglyModule; // undefined = not tried yet, null = not installed

async function loadImgly() {
  if (imglyModule === undefined) {
    try {
      imglyModule = await import('@imgly/background-removal-node');
    } catch {
      imglyModule = null;
    }
  }
  return imglyModule;
}

async function removeWithImgly(pngBuffer) {
  const mod = await loadImgly();
  if (!mod) throw new Error('@imgly/background-removal-node is not installed');
  const blob = await mod.removeBackground(new Blob([pngBuffer], { type: 'image/png' }), {
    model: config.bgRemoval.imglyModel,
    output: { format: 'image/png', quality: 1 },
  });
  return Buffer.from(await blob.arrayBuffer());
}

// Needs the Cloudinary "AI Background Removal" add-on. The first request for the derived image
// returns 423 while Cloudinary works on it, so we poll.
async function removeWithCloudinary(pngBuffer) {
  if (!cloudinaryEnabled) throw new Error('Cloudinary is not configured');
  const uploaded = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: `${config.cloudinary.folder}/tmp`, resource_type: 'image' }, (err, res) =>
        err ? reject(err) : resolve(res),
      )
      .end(pngBuffer);
  });
  try {
    const url = cloudinary.url(uploaded.public_id, { effect: 'background_removal', format: 'png', secure: true });
    for (let attempt = 0; attempt < 30; attempt++) {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status !== 423) throw new Error(`Cloudinary background removal failed: HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Cloudinary background removal timed out');
  } finally {
    cloudinary.uploader.destroy(uploaded.public_id).catch(() => {});
  }
}

export async function removeBackground(pngBuffer) {
  let provider = config.bgRemoval.provider;
  if (provider === 'auto') provider = (await loadImgly()) ? 'imgly' : 'none';

  switch (provider) {
    case 'imgly':
      return { buffer: await removeWithImgly(pngBuffer), method: 'imgly' };
    case 'cloudinary':
      return { buffer: await removeWithCloudinary(pngBuffer), method: 'cloudinary' };
    case 'none':
      return { buffer: pngBuffer, method: 'none' };
    default:
      throw new Error(`Unknown BG_REMOVAL_PROVIDER: ${provider}`);
  }
}
