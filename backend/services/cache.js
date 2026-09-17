'use strict';

/**
 * SmartNyumba Pro — Cache Service
 *
 * Wraps Redis (ioredis) with an automatic in-memory LRU fallback.
 * The app works correctly whether Redis is available or not —
 * the fallback just means no cross-worker cache sharing.
 *
 * Env vars (all optional):
 *   REDIS_URL       — redis://localhost:6379 (default)
 *   REDIS_PASSWORD  — password if required
 *   CACHE_TTL       — default TTL in seconds (default: 60)
 *
 * Usage:
 *   const cache = require('./services/cache');
 *   const data  = await cache.get('key');
 *   await cache.set('key', data, 30);   // 30s TTL
 *   await cache.del('key');
 *   await cache.wrap('key', ttl, async () => expensiveQuery());
 */

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL || '60', 10);
const MAX_MEMORY_KEYS = 500;  // in-memory fallback cap

// ── In-memory LRU fallback ────────────────────────────────────
class MemoryCache {
  constructor() { this._store = new Map(); }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expires && entry.expires < Date.now()) { this._store.delete(key); return null; }
    return entry.value;
  }

  set(key, value, ttl = DEFAULT_TTL) {
    if (this._store.size >= MAX_MEMORY_KEYS) {
      // Evict oldest entry
      this._store.delete(this._store.keys().next().value);
    }
    this._store.set(key, { value, expires: ttl > 0 ? Date.now() + ttl * 1000 : null });
  }

  del(key) { this._store.delete(key); }

  delPattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this._store.keys()) {
      if (regex.test(key)) this._store.delete(key);
    }
  }

  flush() { this._store.clear(); }
  size()  { return this._store.size; }
}

// ── Redis driver ──────────────────────────────────────────────
let _redis = null;
let _usingRedis = false;

function tryConnectRedis() {
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) return;
  try {
    const Redis = require('ioredis');
    const client = new Redis(process.env.REDIS_URL || {
      host:     process.env.REDIS_HOST || '127.0.0.1',
      port:     parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db:       parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    client.on('ready', () => {
      _usingRedis = true;
      global.logger?.info('✅ Redis connected — cache active');
    });
    client.on('error', (e) => {
      if (_usingRedis) global.logger?.warn('Redis error, falling back to memory cache:', e.message);
      _usingRedis = false;
    });
    _redis = client;
    client.connect().catch(() => {});
  } catch (_) {
    global.logger?.info('ioredis not installed — using in-memory cache (install with: npm install ioredis)');
  }
}
tryConnectRedis();

const _memory = new MemoryCache();

// ── Public API ────────────────────────────────────────────────
const cache = {
  /** Returns true if Redis is connected */
  isRedis: () => _usingRedis,

  /** Get a cached value. Returns parsed object or null. */
  async get(key) {
    try {
      if (_usingRedis) {
        const raw = await _redis.get(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (_) {}
    return _memory.get(key);
  },

  /** Set a value with TTL in seconds (0 = no expiry). */
  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      if (_usingRedis) {
        const serialised = JSON.stringify(value);
        if (ttl > 0) await _redis.setex(key, ttl, serialised);
        else         await _redis.set(key, serialised);
        return;
      }
    } catch (_) {}
    _memory.set(key, value, ttl);
  },

  /** Delete a specific key. */
  async del(key) {
    try { if (_usingRedis) { await _redis.del(key); return; } } catch (_) {}
    _memory.del(key);
  },

  /** Delete all keys matching a glob pattern (e.g. 'dashboard:*'). */
  async delPattern(pattern) {
    try {
      if (_usingRedis) {
        const keys = await _redis.keys(pattern);
        if (keys.length) await _redis.del(...keys);
        return;
      }
    } catch (_) {}
    _memory.delPattern(pattern);
  },

  /** Flush all keys (use sparingly). */
  async flush() {
    try { if (_usingRedis) { await _redis.flushdb(); return; } } catch (_) {}
    _memory.flush();
  },

  /**
   * Wrap an async function with caching.
   * If cache hit: returns cached value immediately.
   * If cache miss: runs fn(), caches result, returns it.
   *
   * @example
   * const data = await cache.wrap(`dashboard:${org_id}`, 15, () => buildDashboard(org_id));
   */
  async wrap(key, ttl, fn) {
    const cached = await cache.get(key);
    if (cached !== null) return cached;
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  },

  /** Get raw Redis client (null if not connected). */
  redis: () => _redis,
};

module.exports = cache;
