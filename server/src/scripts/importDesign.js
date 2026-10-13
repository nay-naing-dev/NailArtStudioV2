// Imports a local reference photo as a design, the same way an admin upload does: stores the
// original, runs the isolation pipeline, and saves the isolated asset and swatch to MongoDB.
//
//   npm run import:design -- <image> --name "Navy & Gold" --price 30000 [--category art] [--tolerance 2.5]
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { connectDB, disconnectDB } from '../config/db.js';
import { Design } from '../models/Design.js';
import { User } from '../models/User.js';
import { processDesign } from '../services/designProcessor.js';
import { uploadImage } from '../services/storage.js';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!input || !flag('name') || flag('price') == null) {
  console.error('Usage: npm run import:design -- <image> --name "Design name" --price 30000 [--category art] [--tolerance 2.5]');
  process.exit(1);
}

await connectDB();
try {
  const admin = await User.findOne({ role: 'admin' });
  const jpeg = await sharp(await fs.readFile(input)).rotate().jpeg({ quality: 90 }).toBuffer();
  const design = await Design.create({
    name: flag('name'),
    price: Number(flag('price')),
    category: flag('category', 'general'),
    originalImage: await uploadImage(jpeg, { folder: 'designs/originals', format: 'jpg' }),
    processing: { status: 'pending' },
    createdBy: admin?._id,
  });

  const tolerance = flag('tolerance');
  await processDesign(design.id, { buffer: jpeg, skinTolerance: tolerance != null ? Number(tolerance) : undefined });

  const saved = await Design.findById(design.id);
  console.log(`\nDesign ${saved.id}: ${saved.processing.status}`);
  if (saved.processing.status !== 'ready') {
    console.log(`  error: ${saved.processing.error}`);
    process.exitCode = 1;
  } else {
    console.log(`  nails found: ${saved.processing.nailsDetected} (background removal: ${saved.processing.method})`);
    for (const key of ['originalImage', 'isolatedImage', 'swatchImage']) {
      console.log(`  ${key.padEnd(14)} ${saved[key].url}`);
    }
    console.log(`  admin page:    /admin/designs/${saved.id}`);
  }
} finally {
  await disconnectDB();
}
