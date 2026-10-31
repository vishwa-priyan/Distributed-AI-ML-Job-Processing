import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from project root or current dir
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function resolveStoragePath(val: string | undefined, defaultRel: string): string {
  const projectRoot = path.resolve(__dirname, '../../../');
  if (!val) return path.resolve(projectRoot, defaultRel);
  if (path.isAbsolute(val)) return val;
  return path.resolve(projectRoot, val);
}

const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-replace-in-production-min-32-chars-long'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16).default('super-secret-refresh-key-replace-in-production-min-32-chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  DATABASE_URL: z.string().default('postgresql://postgres:1234@localhost:5432/distributed_ml'),
  REDIS_URL: z.string().default('redis://localhost:6379/0'),

  SCHEDULER_URL: z.string().default('http://localhost:8000'),
  STORAGE_UPLOADS_DIR: z.string().optional().transform(v => resolveStoragePath(v, 'storage/uploads')),
  STORAGE_ARTIFACTS_DIR: z.string().optional().transform(v => resolveStoragePath(v, 'storage/artifacts')),
  STORAGE_BATCHES_DIR: z.string().optional().transform(v => resolveStoragePath(v, 'storage/batches')),
  MAX_UPLOAD_SIZE_BYTES: z.string().default('104857600').transform(Number)
});

export const env = envSchema.parse(process.env);
