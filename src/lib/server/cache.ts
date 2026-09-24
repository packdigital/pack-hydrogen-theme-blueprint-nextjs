/**
 * Caching strategies for Storefront API, Admin API and Pack queries.
 *
 * On Oxygen these went through the worker Cache API via Hydrogen's
 * `createWithCache`. On Next.js 16 with Cache Components, cacheable reads
 * are `'use cache: remote'` functions (in `./storefront.ts`,
 * `~/lib/admin-api/admin.ts` and `~/lib/pack/create-pack-client.ts`): durable
 * and shared across serverless instances, with `cacheLife` derived from the
 * strategy below and `cacheTag` for on-demand `revalidateTag()`.
 *
 * The strategy helpers keep Hydrogen's names and shapes so existing call
 * sites (`storefront.CacheLong()`, `admin.CacheShort()`, ...) are unchanged.
 */

export type CachingStrategy = {
  mode?: 'public' | 'private' | 'no-store' | 'must-revalidate' | 'no-cache';
  maxAge?: number;
  staleWhileRevalidate?: number;
  sMaxAge?: number;
  staleIfError?: number;
};

export function CacheNone(): CachingStrategy {
  return {mode: 'no-store'};
}

export function CacheShort(overrideOptions?: CachingStrategy): CachingStrategy {
  return {
    mode: 'public',
    maxAge: 1,
    staleWhileRevalidate: 9,
    ...overrideOptions,
  };
}

export function CacheLong(overrideOptions?: CachingStrategy): CachingStrategy {
  return {
    mode: 'public',
    maxAge: 3600,
    staleWhileRevalidate: 82800,
    ...overrideOptions,
  };
}

export function CacheCustom(overrideOptions: CachingStrategy): CachingStrategy {
  return overrideOptions;
}

/** Cache-Control header value for a strategy (used by resource routes). */
export function generateCacheControlHeader(strategy: CachingStrategy) {
  const {mode, maxAge, staleWhileRevalidate, sMaxAge, staleIfError} = strategy;
  if (mode === 'no-store') return 'no-store';
  return [
    mode,
    maxAge !== undefined && `max-age=${maxAge}`,
    sMaxAge !== undefined && `s-maxage=${sMaxAge}`,
    staleWhileRevalidate !== undefined &&
      `stale-while-revalidate=${staleWhileRevalidate}`,
    staleIfError !== undefined && `stale-if-error=${staleIfError}`,
  ]
    .filter(Boolean)
    .join(', ');
}

export const CACHE_TAGS = {
  storefront: 'storefront',
  admin: 'admin',
  pack: 'pack',
} as const;

type RunOptions<T> = {
  cacheKey: unknown[];
  cacheStrategy?: CachingStrategy;
  shouldCacheResult?: (value: T) => boolean;
  tags?: string[];
};

type RunFn<T> = (utils: {addDebugData: (data: unknown) => void}) => Promise<T>;

export type WithCache = {
  run<T>(options: RunOptions<T>, fn: RunFn<T>): Promise<T>;
};

const noopDebug = {addDebugData: () => {}};

async function hashKey(cacheKey: unknown[]) {
  const data = new TextEncoder().encode(JSON.stringify(cacheKey));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getRevalidateSeconds(strategy?: CachingStrategy) {
  if (!strategy || strategy.mode === 'no-store') return 0;
  return Math.max(1, Math.round(strategy.maxAge ?? strategy.sMaxAge ?? 0));
}

/** A `cacheLife()` profile (seconds). */
export type CacheLifeProfile = {
  stale: number;
  revalidate: number;
  expire: number;
};

/**
 * Map a Hydrogen caching strategy to a `cacheLife` profile:
 * `revalidate` = max-age (fresh window), `expire` = max-age +
 * stale-while-revalidate + stale-if-error (how long a stale entry may still be
 * served while revalidating, or after a failed revalidation). `null` means
 * "don't cache".
 */
export function toCacheLife(
  strategy?: CachingStrategy,
): CacheLifeProfile | null {
  const revalidate = getRevalidateSeconds(strategy);
  if (!strategy || !revalidate) return null;
  const expire =
    revalidate +
    Math.max(0, strategy.staleWhileRevalidate ?? 0) +
    Math.max(0, strategy.staleIfError ?? 0);
  return {stale: revalidate, revalidate, expire: Math.max(expire, revalidate)};
}

/**
 * Lifetime for results that came back with GraphQL/API errors (including
 * Pack's "not found" errors for missing content): short enough that a
 * transient upstream error clears quickly, long enough that 404 pages don't
 * hit the API on every request.
 */
export const ERROR_CACHE_LIFE: CacheLifeProfile = {
  stale: 10,
  revalidate: 10,
  expire: 30,
};

type MemoryEntry = {value: unknown; expiresAt: number};
const memoryStore = new Map<string, MemoryEntry>();
const MEMORY_STORE_LIMIT = 500;

/**
 * Per-instance in-memory cache with Hydrogen's `withCache.run()` shape, for
 * code that runs outside a render — the proxy, where `'use cache'` is not
 * available — and for Pack's A/B test rules. Only suitable for small, shared
 * payloads (test rules, localization, publish timestamps).
 */
export function createMemoryWithCache(): WithCache {
  return {
    async run<T>(
      {cacheKey, cacheStrategy, shouldCacheResult}: RunOptions<T>,
      fn: RunFn<T>,
    ) {
      const revalidate = getRevalidateSeconds(cacheStrategy);
      if (!revalidate) return fn(noopDebug);

      const key = await hashKey(cacheKey);
      const hit = memoryStore.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;

      const value = await fn(noopDebug);
      if (!shouldCacheResult || shouldCacheResult(value)) {
        if (memoryStore.size >= MEMORY_STORE_LIMIT) {
          const oldestKey = memoryStore.keys().next().value;
          if (oldestKey) memoryStore.delete(oldestKey);
        }
        memoryStore.set(key, {
          value,
          expiresAt: Date.now() + revalidate * 1000,
        });
      }
      return value;
    },
  };
}
