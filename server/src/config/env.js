import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 5000);

export const config = {
  env,
  isProd: env === 'production',
  port,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),

  mongoUri: required('MONGODB_URI', env === 'production' ? undefined : 'mongodb://127.0.0.1:27017/nail_studio'),

  jwt: {
    secret: required('JWT_SECRET', env === 'production' ? undefined : 'dev-only-insecure-secret'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'nail-studio',
  },

  // Generative AI try-on (Replicate). Disabled until a token is set.
  replicate: {
    token: process.env.REPLICATE_API_TOKEN || '',
    apiBase: (process.env.REPLICATE_API_BASE || 'https://api.replicate.com/v1').replace(/\/$/, ''),
    // multi-image: an image-editing model that takes several reference images (photo + design + mask)
    // inpaint:     a classic mask-based inpainting model (image + mask + prompt; cannot see the design)
    // custom:      your own input shape via REPLICATE_INPUT_TEMPLATE
    preset: (process.env.REPLICATE_PRESET || 'multi-image').toLowerCase(),
    model: process.env.REPLICATE_MODEL || '',
    inputTemplate: process.env.REPLICATE_INPUT_TEMPLATE || '',
    timeoutMs: Number(process.env.REPLICATE_TIMEOUT_MS || 180000),
    patternSource: (process.env.TRYON_PATTERN_SOURCE || 'isolated').toLowerCase(), // isolated | swatch
  },
  tryon: {
    ratePerHour: Number(process.env.TRYON_RATE_PER_HOUR || 10), // per user
    dailyLimit: Number(process.env.TRYON_DAILY_LIMIT || 200), // across all users; protects your Replicate bill
    retentionDays: Number(process.env.TRYON_RETENTION_DAYS || 30),
    maxPx: Number(process.env.TRYON_MAX_PX || 1024),
  },

  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || 'uploads'),

  bgRemoval: {
    provider: (process.env.BG_REMOVAL_PROVIDER || 'auto').toLowerCase(),
    imglyModel: process.env.IMGLY_MODEL || 'medium',
  },
  defaultSkinTolerance: Number(process.env.DEFAULT_SKIN_TOLERANCE || 2.5),

  studio: {
    timezone: process.env.STUDIO_TIMEZONE || 'UTC',
    openTime: process.env.OPEN_TIME || '10:00',
    closeTime: process.env.CLOSE_TIME || '19:00',
    slotMinutes: Number(process.env.SLOT_MINUTES || 60),
    closedWeekdays: (process.env.CLOSED_WEEKDAYS ?? '0')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
    bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS || 60),
  },
};

export const aiTryOnEnabled = () => Boolean(config.replicate.token);

export const cloudinaryEnabled = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
);
