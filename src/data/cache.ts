import {
  CacheLong,
  CacheNone,
  CacheShort,
  generateCacheControlHeader,
} from '~/lib/server/cache';

/**
 * React Router `headers` export helper. Next.js has no route `headers`
 * export, so page routes drop it; kept so any remaining callers type-check.
 */
export function routeHeaders({loaderHeaders}: {loaderHeaders: Headers}) {
  // Keep the same cache-control headers when loading the page directly
  // versus when transititioning to the page from other areas in the app
  return {
    'Cache-Control': loaderHeaders.get('Cache-Control'),
  };
}

export const CACHE_SHORT = generateCacheControlHeader(CacheShort());
export const CACHE_LONG = generateCacheControlHeader(CacheLong());
export const CACHE_NONE = generateCacheControlHeader(CacheNone());
