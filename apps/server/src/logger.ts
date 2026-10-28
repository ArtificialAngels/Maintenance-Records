import { createRequire } from 'node:module';
import pino from 'pino';
import { config } from './config.js';

/**
 * pino-pretty is a development nicety: it is resolved by pino's worker
 * thread at runtime, so it cannot be bundled. When the app runs from a
 * bundled build without node_modules (the production release), resolving it
 * fails and pino would crash on startup. Only enable it when it is actually
 * available, and fall back to plain JSON logs otherwise.
 */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport:
    config.isDev && prettyAvailable()
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        }
      : undefined,
});
