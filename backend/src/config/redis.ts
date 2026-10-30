import { createClient } from 'redis';
import { env } from './env.js';

export const redisClient = createClient({
  url: env.REDIS_URL
});

redisClient.on('error', (err) => {
  console.error('[Redis Client Error]', err);
});

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('[Redis] Connected successfully to', env.REDIS_URL);
  }
}
