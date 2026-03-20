import IORedis from 'ioredis';

const Redis = IORedis.default ?? IORedis;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err: Error) => {
  console.error(`[Redis] ${err.message}`);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export async function storeRefreshToken(userId: string, tokenId: string): Promise<void> {
  const key = `refresh:${userId}:${tokenId}`;
  await redis.set(key, '1', 'EX', REFRESH_TTL);
}

export async function isRefreshTokenValid(userId: string, tokenId: string): Promise<boolean> {
  const key = `refresh:${userId}:${tokenId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

export async function revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
  const key = `refresh:${userId}:${tokenId}`;
  await redis.del(key);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const pattern = `refresh:${userId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export default redis;
