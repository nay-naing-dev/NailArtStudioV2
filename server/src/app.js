import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config, cloudinaryEnabled } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  // Images are drawn onto a <canvas> in the try-on view, so they must be loadable cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // In development, accept the client on any local port: Vite moves to 5174+ when 5173 is busy, and
  // the try-on canvas can't use design images unless they're served with a matching CORS header.
  const localDev = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.clientOrigin.includes(origin) || (!config.isProd && localDev.test(origin))),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      storage: cloudinaryEnabled ? 'cloudinary' : 'local',
      bgRemoval: config.bgRemoval.provider,
      aiTryOn: Boolean(config.replicate.token),
    });
  });
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
