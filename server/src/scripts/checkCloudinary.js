// Confirms the Cloudinary credentials in server/.env work: pings the API, then uploads and deletes a 1x1 test image.
// Never prints the API key or secret.
//
//   npm run check:cloudinary
import sharp from 'sharp';
import { cloudinary, cloudinaryEnabled } from '../config/cloudinary.js';
import { config } from '../config/env.js';

const missing = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter((k) => !process.env[k]);
if (!cloudinaryEnabled) {
  console.error(`Cloudinary is not configured. Missing in server/.env: ${missing.join(', ')}`);
  process.exit(1);
}

try {
  console.log(`Cloud name: ${config.cloudinary.cloudName}`);
  await cloudinary.api.ping();
  console.log('✓ Credentials accepted');

  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#10261c' } }).png().toBuffer();
  const uploaded = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: `${config.cloudinary.folder}/tmp`, resource_type: 'image' }, (err, res) => (err ? reject(err) : resolve(res)))
      .end(png);
  });
  console.log(`✓ Upload works (${uploaded.secure_url})`);
  await cloudinary.uploader.destroy(uploaded.public_id);
  console.log('✓ Delete works');
  console.log(`\nAll good. New images will be stored under the "${config.cloudinary.folder}/" folder.`);
} catch (err) {
  const msg = err?.error?.message || err?.message || String(err);
  console.error(`✗ Cloudinary check failed: ${msg}`);
  if (/api_key|signature|credentials|401|Invalid/i.test(msg)) {
    console.error('  Check the cloud name, API key and API secret in server/.env (no quotes or spaces).');
  }
  process.exit(1);
}
