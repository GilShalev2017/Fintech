import { createClient, RedisClientType } from 'redis';

// ─────────────────────────────────────────────
// 🔴 REDIS CONNECTION
// ─────────────────────────────────────────────
// Module-level singleton — one shared client for the entire process.
// All helpers below check isOpen before every call so the app degrades
// gracefully if Redis goes down (returns null/false instead of crashing).
let redisClient: RedisClientType | null = null;

const connectRedis = async (): Promise<RedisClientType> => {
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    // Pass undefined (not empty string) when no password is set —
    // an empty string would cause an AUTH failure against a passwordless Redis.
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB || '0'),
  }) as RedisClientType;

  // ── Event handlers ─────────────────────────────────────────────────────
  // 'error' must be registered before .connect() to avoid unhandled
  // EventEmitter errors crashing the process.
  redisClient.on('error', (err: Error) => {
    console.error('❌ Redis error:', err);
  });

  redisClient.on('reconnecting', () => {
    console.warn('⚠️  Redis reconnecting...');
  });

  redisClient.on('ready', () => {
    console.log('🔄 Redis ready');
  });

  redisClient.on('end', () => {
    console.log('Redis connection closed');
  });

  await redisClient.connect();
  return redisClient;
};

// ─────────────────────────────────────────────
// ⚡ CACHE HELPERS
// ─────────────────────────────────────────────
// All helpers are silent-fail: if Redis is unavailable the app keeps running,
// just without caching. This is intentional — Redis is not a hard dependency
// for correctness, only for performance.

export const cacheHelper = {

  // GET — returns parsed value or null if missing / Redis unavailable
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      if (!redisClient?.isOpen) return null;
      const data = await redisClient.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  // SET — stores JSON-serialized value with a TTL (default 5 minutes)
  // Uses setEx so the key always expires — never leaves stale data forever.
  async set(key: string, value: unknown, ttl: number = 300): Promise<boolean> {
    try {
      if (!redisClient?.isOpen) return false;
      await redisClient.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  // DEL — removes a single key
  async del(key: string): Promise<boolean> {
    try {
      if (!redisClient?.isOpen) return false;
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  // DEL PATTERN — removes all keys matching a glob pattern
  // ⚠️  KEYS is O(N) — safe for dev/low-traffic, but in high-traffic production
  // prefer SCAN-based deletion to avoid blocking the Redis event loop.
  // Usage example: cacheHelper.delPattern('search:*')
  async delPattern(pattern: string): Promise<boolean> {
    try {
      if (!redisClient?.isOpen) return false;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        // del() accepts an array — one round trip for all keys
        await redisClient.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Redis DEL PATTERN error:', error);
      return false;
    }
  },
};

export const getRedisClient = (): RedisClientType | null => redisClient;
export default connectRedis;