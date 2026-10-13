// Prints the input fields of the configured Replicate model, so you can confirm the preset matches.
//   npm run replicate:schema
import { config } from '../config/env.js';
import { fetchInputSchema, modelName } from '../services/replicate.js';

if (!config.replicate.token) {
  console.error('Set REPLICATE_API_TOKEN in .env first.');
  process.exit(1);
}
console.log(`Preset: ${config.replicate.preset}   Model: ${modelName()}\n`);
try {
  const { model, version, input, output } = await fetchInputSchema();
  console.log(`${model} @ ${version}\n\nInput fields:`);
  const required = new Set(input?.required ?? []);
  for (const [name, def] of Object.entries(input?.properties ?? {})) {
    const type = def.type === 'array' ? `array<${def.items?.type ?? '?'}${def.items?.format ? `:${def.items.format}` : ''}>` : `${def.type ?? def.allOf ? 'enum/object' : '?'}${def.format ? `:${def.format}` : ''}`;
    console.log(`  ${required.has(name) ? '*' : ' '} ${name.padEnd(22)} ${type.padEnd(22)} ${(def.description ?? '').slice(0, 90)}`);
  }
  console.log('\n(* = required)   Output:', JSON.stringify(output));
  console.log('\nThe preset sends:');
  console.log({ 'multi-image': 'prompt, image_input[photo, pattern, mask], output_format', inpaint: 'prompt, image, mask', custom: 'REPLICATE_INPUT_TEMPLATE' }[config.replicate.preset]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
