import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { cloudinary, cloudinaryEnabled } from '../config/cloudinary.js';
import { config } from '../config/env.js';

/**
 * Stores image buffers in Cloudinary when it's configured, otherwise on local disk under /uploads.
 * Every asset is described as { url, publicId, provider, width, height }.
 */

export async function uploadImage(buffer, { folder = 'misc', format = 'png' } = {}) {
  if (cloudinaryEnabled) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `${config.cloudinary.folder}/${folder}`, resource_type: 'image', format },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
      stream.end(buffer);
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      provider: 'cloudinary',
      width: result.width,
      height: result.height,
    };
  }

  const relDir = folder.replace(/[^a-z0-9/_-]/gi, '');
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${format}`;
  const publicId = path.posix.join(relDir, fileName);
  const absPath = path.join(config.uploadDir, publicId);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);
  const meta = await sharp(buffer).metadata();
  return {
    url: `${config.publicBaseUrl}/uploads/${publicId}`,
    publicId,
    provider: 'local',
    width: meta.width,
    height: meta.height,
  };
}

export async function deleteImage(asset) {
  if (!asset?.publicId) return;
  try {
    if (asset.provider === 'cloudinary') {
      await cloudinary.uploader.destroy(asset.publicId, { resource_type: 'image' });
    } else {
      const absPath = path.resolve(config.uploadDir, asset.publicId);
      // Refuse to delete anything outside the upload dir.
      if (absPath.startsWith(config.uploadDir + path.sep)) await fs.unlink(absPath);
    }
  } catch (err) {
    console.warn(`[storage] failed to delete ${asset.publicId}: ${err.message}`);
  }
}

export async function readImage(asset) {
  if (asset.provider === 'local') {
    return fs.readFile(path.resolve(config.uploadDir, asset.publicId));
  }
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Failed to download ${asset.url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
