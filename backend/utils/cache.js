'use strict';
/**
 * Simple in-process LRU cache with TTL.
 * Drops in as a Redis replacement for local/single-process deployments.
 * When REDIS_URL is set, delegates to ioredis automatically.
 */

let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.connect().catch(()=>{ redis = null; }); // fall back to in-process on connection failure
  } catch { /* ioredis not installed — use in-process cache */ }
}

// In-process fallback
const store = new Map();
const inProc = {
  async get(key) {
    const e = store.get(key);
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) { store.delete(key); return null; }
    return e.val;
  },
  async set(key, val, ttlSec = 300) {
    store.set(key, { val, exp: ttlSec > 0 ? Date.now() + ttlSec*1000 : 0 });
    return true;
  },
  async del(key) { store.delete(key); return true; },
  async delPattern(pattern) {
    const re = new RegExp('^' + pattern.replace(/\*/g,'.*') + '$');
    for (const k of store.keys()) if (re.test(k)) store.delete(k);
    return true;
  },
};

const cache = {
  async get(key) {
    if (redis) { const v = await redis.get(key).catch(()=>null); return v ? JSON.parse(v) : null; }
    return inProc.get(key);
  },
  async set(key, val, ttlSec = 300) {
    const s = JSON.stringify(val);
    if (redis) return redis.setex(key, ttlSec, s).catch(()=>null);
    return inProc.set(key, val, ttlSec);
  },
  async del(key) {
    if (redis) return redis.del(key).catch(()=>null);
    return inProc.del(key);
  },
  async delPattern(pattern) {
    if (redis) {
      const keys = await redis.keys(pattern).catch(()=>[]);
      if (keys.length) await redis.del(...keys).catch(()=>{});
      return true;
    }
    return inProc.delPattern(pattern);
  },
  /** Wrap an async function with cache-aside pattern */
  async wrap(key, fn, ttlSec = 300) {
    const cached = await cache.get(key);
    if (cached !== null) return cached;
    const result = await fn();
    await cache.set(key, result, ttlSec);
    return result;
  },
};

module.exports = cache;
