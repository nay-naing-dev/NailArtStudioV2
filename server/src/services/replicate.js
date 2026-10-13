import { config } from '../config/env.js';

/**
 * Minimal Replicate client: create a prediction, wait for it, download the output.
 * Docs: https://replicate.com/docs/reference/http
 */

const PRESET_DEFAULT_MODEL = {
  'multi-image': 'google/nano-banana',
  inpaint: 'black-forest-labs/flux-fill-pro',
};

export class ReplicateError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const modelName = () => config.replicate.model || PRESET_DEFAULT_MODEL[config.replicate.preset] || '';

/** "owner/name" -> { model }, "owner/name:version" -> { model, version } */
function parseModel(spec) {
  const [model, version] = spec.split(':');
  return { model, version };
}

const toDataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

/** Replaces "{{name}}" string values anywhere in a JSON structure. */
function fill(node, values) {
  if (typeof node === 'string') {
    const m = node.match(/^\{\{(\w+)\}\}$/);
    return m && m[1] in values ? values[m[1]] : node;
  }
  if (Array.isArray(node)) return node.map((n) => fill(n, values));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, values)]));
  return node;
}

/**
 * Builds the model input for the configured preset.
 * @param {{prompt: string, photo: Buffer, mask: Buffer, pattern?: Buffer}} p  photo is JPEG, mask and pattern PNG
 */
export function buildInput({ prompt, photo, mask, pattern }) {
  const values = {
    prompt,
    photo: toDataUri(photo, 'image/jpeg'),
    mask: toDataUri(mask, 'image/png'),
    pattern: pattern ? toDataUri(pattern, 'image/png') : undefined,
  };
  switch (config.replicate.preset) {
    case 'multi-image':
      // Reference-image editors take an ordered list. The prompt refers to them as image 1, 2 and 3.
      return { prompt, image_input: [values.photo, values.pattern, values.mask].filter(Boolean), output_format: 'jpg' };
    case 'inpaint':
      // White mask pixels are regenerated. The model never sees the design, only the prompt.
      return { prompt, image: values.photo, mask: values.mask };
    case 'custom': {
      if (!config.replicate.inputTemplate) throw new ReplicateError('REPLICATE_INPUT_TEMPLATE is not set');
      let tpl;
      try {
        tpl = JSON.parse(config.replicate.inputTemplate);
      } catch {
        throw new ReplicateError('REPLICATE_INPUT_TEMPLATE is not valid JSON');
      }
      return fill(tpl, values);
    }
    default:
      throw new ReplicateError(`Unknown REPLICATE_PRESET: ${config.replicate.preset}`);
  }
}

const headers = () => ({ Authorization: `Bearer ${config.replicate.token}`, 'Content-Type': 'application/json' });

async function api(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ReplicateError(`Could not reach Replicate: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail || body.title || res.statusText;
    const hint =
      res.status === 401 ? ' (check REPLICATE_API_TOKEN)'
      : res.status === 402 ? ' (Replicate billing: add credit to your account)'
      : res.status === 404 ? ' (model not found, check REPLICATE_MODEL)'
      : res.status === 422 ? ' (the model rejected the input: run npm run replicate:schema and adjust the preset)'
      : '';
    throw new ReplicateError(`Replicate error ${res.status}: ${detail}${hint}`, res.status);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs a prediction to completion. Returns the final prediction object. */
export async function runPrediction(input, { onCreated } = {}) {
  const { model, version } = parseModel(modelName());
  if (!model) throw new ReplicateError('No Replicate model configured');
  const { apiBase } = config.replicate;
  const url = version ? `${apiBase}/predictions` : `${apiBase}/models/${model}/predictions`;

  let prediction = await api(url, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'wait=30' }, // returns early if it finishes within 30s
    body: JSON.stringify(version ? { version, input } : { input }),
  });
  onCreated?.(prediction.id);

  const deadline = Date.now() + config.replicate.timeoutMs;
  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status)) {
    if (Date.now() > deadline) {
      if (prediction.urls?.cancel) fetch(prediction.urls.cancel, { method: 'POST', headers: headers() }).catch(() => {});
      throw new ReplicateError('The AI model took too long. Please try again.');
    }
    await sleep(1500);
    prediction = await api(prediction.urls.get, { headers: headers() });
  }
  if (prediction.status !== 'succeeded') {
    throw new ReplicateError(`Generation ${prediction.status}: ${String(prediction.error || 'no details').slice(0, 300)}`);
  }
  return prediction;
}

/** The first image URL in a prediction's output (string, array or { url }). */
export function outputUrl(prediction) {
  const out = prediction.output;
  const first = Array.isArray(out) ? out[0] : out;
  const url = typeof first === 'string' ? first : first?.url;
  if (!url) throw new ReplicateError('The model returned no image');
  return url;
}

function trusted(url) {
  const u = new URL(url);
  const base = new URL(config.replicate.apiBase);
  if (u.origin === base.origin) return true; // same API host (also covers a local mock in tests)
  return u.protocol === 'https:' && /(^|\.)replicate\.(delivery|com)$/.test(u.hostname);
}

/** Downloads an output file, refusing hosts that aren't Replicate's. */
export async function downloadOutput(url) {
  if (!trusted(url)) throw new ReplicateError('Refusing to download from an untrusted host');
  let res = await fetch(url);
  if (res.status === 401 || res.status === 403) res = await fetch(url, { headers: { Authorization: `Bearer ${config.replicate.token}` } });
  if (!res.ok) throw new ReplicateError(`Could not download the generated image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fetches the model's input schema (needs a valid token). Used by `npm run replicate:schema`. */
export async function fetchInputSchema() {
  const { model, version } = parseModel(modelName());
  const info = await api(`${config.replicate.apiBase}/models/${model}`, { headers: headers() });
  const latest = version ? await api(`${config.replicate.apiBase}/models/${model}/versions/${version}`, { headers: headers() }) : info.latest_version;
  return { model, version: latest?.id, input: latest?.openapi_schema?.components?.schemas?.Input, output: latest?.openapi_schema?.components?.schemas?.Output };
}
