// Runs the nail isolation pipeline on a local image and writes the results next to it.
//
//   npm run test:isolation -- <image> [--tolerance 2.5] [--provider imgly|cloudinary|none]
//
// Outputs (in <image dir>/output/):
//   <name>-isolated.png  transparent PNG of the nails only
//   <name>-swatch.png    try-on texture
//   <name>-preview.png   original | isolated (on a checkerboard) | swatch
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!input) {
  console.error('Usage: npm run test:isolation -- <image> [--tolerance 2.5] [--provider imgly|cloudinary|none]');
  process.exit(1);
}
// Must be set before the pipeline modules read the config.
if (flag('provider')) process.env.BG_REMOVAL_PROVIDER = flag('provider');

const { isolateNails } = await import('../services/nailIsolation.js');
const { config } = await import('../config/env.js');

const tolerance = Number(flag('tolerance', config.defaultSkinTolerance));
const name = path.basename(input, path.extname(input));
const outDir = path.join(path.dirname(input), 'output');
await fs.mkdir(outDir, { recursive: true });

console.log(`Isolating ${input} (provider=${config.bgRemoval.provider}, skin tolerance=${tolerance})…`);
const started = Date.now();
const debug = args.includes('--debug');
const result = await isolateNails(await fs.readFile(input), { skinTolerance: tolerance, debug });
console.log(
  `Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${result.nailsDetected} nail region(s), ` +
    `background removal=${result.method}, skin removed=${result.skinRemoved}, main colour=${result.dominantColor}`,
);

const files = {
  isolated: path.join(outDir, `${name}-isolated.png`),
  swatch: path.join(outDir, `${name}-swatch.png`),
  preview: path.join(outDir, `${name}-preview.png`),
};
await fs.writeFile(files.isolated, result.isolatedPng);
await fs.writeFile(files.swatch, result.swatchPng);

// Preview strip: each panel 600px tall, isolated result shown on a checkerboard.
const H = 600;
const panel = (buf) => sharp(buf).resize({ height: H, width: 900, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
const [orig, iso, sw] = await Promise.all([
  panel(await sharp(await fs.readFile(input)).rotate().toBuffer()),
  panel(result.isolatedPng),
  panel(result.swatchPng),
]);
const tile = 16;
const checker = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${iso.info.width}" height="${H}">` +
    `<defs><pattern id="c" width="${tile * 2}" height="${tile * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${tile * 2}" height="${tile * 2}" fill="#fff"/><rect width="${tile}" height="${tile}" fill="#e6e6e6"/>` +
    `<rect x="${tile}" y="${tile}" width="${tile}" height="${tile}" fill="#e6e6e6"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#c)"/></svg>`,
);
const gap = 16;
const width = orig.info.width + iso.info.width + sw.info.width + gap * 4;
await sharp({ create: { width, height: H + gap * 2, channels: 3, background: '#2a1a20' } })
  .composite([
    { input: orig.data, left: gap, top: gap },
    { input: await sharp(checker).png().toBuffer(), left: orig.info.width + gap * 2, top: gap },
    { input: iso.data, left: orig.info.width + gap * 2, top: gap + Math.round((H - iso.info.height) / 2) },
    { input: sw.data, left: orig.info.width + iso.info.width + gap * 3, top: gap + Math.round((H - sw.info.height) / 2) },
  ])
  .png()
  .toFile(files.preview);

for (const [k, v] of Object.entries(files)) console.log(`  ${k.padEnd(8)} ${v}`);

// --debug: write each intermediate mask (white = kept) and list every component with its fate.
if (debug && result.debug) {
  const { width: w, height: h, masks, components } = result.debug;
  for (const [key, m] of Object.entries(masks)) {
    const file = path.join(outDir, `${name}-mask-${key}.png`);
    await sharp(Buffer.from(m.map((v) => v * 255)), { raw: { width: w, height: h, channels: 1 } }).png().toFile(file);
    console.log(`  mask     ${file}`);
  }
  console.log('\nComponents (area ≥ 30px):');
  for (const c of components.sort((a, b) => b.area - a.area)) {
    console.log(`  #${c.id} area=${c.area} bbox=${c.bbox.join(',')} elong=${c.elongation} skinAdj=${c.skinAdjacency} skin%=${c.skinFraction} ${c.kept ? 'KEPT' : `dropped: ${c.reason}`}`);
  }
}
