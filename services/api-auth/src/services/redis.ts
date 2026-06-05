import IORedis from 'ioredis';

const Redis = IORedis.default ?? IORedis;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // Never stop reconnecting. If Redis is recreated (new IP) or restarted, ioredis
  // keeps retrying with a capped backoff and re-resolves the `redis` hostname on
  // each attempt, so it recovers the new IP on its own. (Previously this returned
  // null after 3 attempts, which made ioredis give up permanently: a Redis restart
  // then left auth unable to read/write device codes until api-auth was manually
  // restarted.)
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000);
  },
  // While Redis is unreachable, queue commands and replay them once reconnected
  // instead of failing them after 3 retries.
  maxRetriesPerRequest: null,
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
