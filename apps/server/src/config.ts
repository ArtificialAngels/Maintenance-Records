import path from 'node:path';
import process from 'node:process';

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  jwtSecret: string;
  publicBaseUrl: string;
  isDev: boolean;
}

function loadEnv(): Partial<AppConfig> {
  const env = process.env;
  return {
    port: env.PORT ? Number(env.PORT) : undefined,
    host: env.HOST,
    dataDir: env.MAINTENANCE_DATA_DIR,
    jwtSecret: env.JWT_SECRET,
    publicBaseUrl: env.PUBLIC_BASE_URL,
  };
}

export const config: AppConfig = {
  port: loadEnv().port ?? 8787,
  host: loadEnv().host ?? '127.0.0.1',
  dataDir: loadEnv().dataDir ?? DEFAULT_DATA_DIR,
  jwtSecret:
    loadEnv().jwtSecret ??
    'dev-only-insecure-secret-please-set-JWT_SECRET-in-prod-0123456789',
  publicBaseUrl: loadEnv().publicBaseUrl ?? 'http://127.0.0.1:8787',
  isDev: process.env.NODE_ENV !== 'production',
};