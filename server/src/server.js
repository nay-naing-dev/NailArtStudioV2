import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { config } from './config/env.js';
import { purgeExpiredTryOns } from './services/tryonProcessor.js';

async function main() {
  await connectDB();
  const app = createApp();

  // Delete AI try-on results (customer hand photos) once they are past the retention period.
  const purge = () => purgeExpiredTryOns().then((n) => n && console.log('[tryon] purged', n, 'expired result(s)')).catch((e) => console.error('[tryon] purge failed:', e.message));
  purge();
  setInterval(purge, 6 * 3600 * 1000).unref();

  const server = app.listen(config.port, () => {
    console.log(`[server] listening on ${config.publicBaseUrl} (${config.env})`);
  });
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] Port ${config.port} is already in use. The server is probably already running in another terminal.\n` +
          `         Stop that one (Ctrl+C), or set a different PORT in .env.`,
      );
    } else {
      console.error('[server] failed to start:', err);
    }
    await disconnectDB();
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
