import 'server-only';

import {cacheLife, cacheTag} from 'next/cache';

import {
  CACHE_TAGS,
  CacheCustom,
  CacheLong,
  CacheNone,
  CacheShort,
  generateCacheControlHeader,
  ERROR_CACHE_LIFE,
  toCacheLife,
  type CacheLifeProfile,
  type CachingStrategy,
  type WithCache,
} from '~/lib/server/cache';
import {getEnv} from '~/lib/server/env';
import type {I18nLocale} from '~/lib/types';

import {ADMIN_ACCESS_TOKEN_HEADER, ADMIN_API_VERSION} from './constants';

/**
 * Admin API client, modeled after the Storefront client (`admin.query`,
 * `admin.mutate`, `admin.CacheShort()`...). Blueprint uses it to preview draft
 * products in the Pack customizer. See README.md.
 *
 * Queries with a cache strategy run in a `'use cache: remote'` function
 * (`cacheLife` from the strategy, tagged `admin`); mutations are never cached.
 */

export type AdminApiErrors =
  Array<{message: string; extensions?: unknown; path?: unknown}> | undefined;

type AdminOptions = {
  variables?: Record<string, any>;
  cache?: CachingStrategy;
  headers?: Record<string, string>;
  adminApiVersion?: string;
  displayName?: string;
};

export type Admin = {
  query: <T = any>(
    query: string,
    options?: AdminOptions,
  ) => Promise<T & {errors?: AdminApiErrors}>;
  mutate: <T = any>(
    mutation: string,
    options?: Omit<AdminOptions, 'cache'>,
  ) => Promise<T & {errors?: AdminApiErrors}>;
  CacheNone: typeof CacheNone;
  CacheLong: typeof CacheLong;
  CacheShort: typeof CacheShort;
  CacheCustom: typeof CacheCustom;
  generateCacheControlHeader: typeof generateCacheControlHeader;
  getShopifyDomain: () => string;
  getApiUrl: (options?: {adminApiVersion?: string}) => string;
  i18n: I18nLocale;
};

async function fetchAdminGraphql<T>({
  url,
  token,
  document,
  variables,
  headers,
}: {
  url: string;
  token: string;
  document: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [ADMIN_ACCESS_TOKEN_HEADER]: token,
      ...headers,
    },
    body: JSON.stringify({query: document, variables: variables || {}}),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[admin] Admin API request failed with status ${response.status}: ${text}`,
    );
  }

  const {data, errors} = (await response.json()) as {
    data?: T;
    errors?: AdminApiErrors;
  };
  return {...(data || {}), ...(errors?.length ? {errors} : {})} as T & {
    errors?: AdminApiErrors;
  };
}

/**
 * Cached Admin API read. The access token is read from env inside, so it is
 * not part of the cache key. Results with errors are
 * kept only briefly (`ERROR_CACHE_LIFE`).
 */
async function queryAdminCached({
  url,
  document,
  variables,
  headers,
  life,
}: {
  url: string;
  document: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
  life: CacheLifeProfile;
}) {
  'use cache: remote';
  cacheTag(CACHE_TAGS.admin);

  const result = await fetchAdminGraphql<Record<string, any>>({
    url,
    token: getEnv().PRIVATE_ADMIN_API_TOKEN,
    document,
    variables,
    headers,
  });
  cacheLife(result.errors?.length ? ERROR_CACHE_LIFE : life);
  return result;
}

export function createAdminClient({
  privateAdminToken,
  storeDomain,
  i18n,
  withCache,
}: {
  privateAdminToken: string;
  storeDomain: string;
  i18n: I18nLocale;
  /** In-memory cache for contexts without cache directives. */
  withCache?: WithCache;
}): {admin: Admin} {
  const shopifyDomain = storeDomain.startsWith('http')
    ? storeDomain
    : `https://${storeDomain}`;

  const getApiUrl = ({adminApiVersion = ADMIN_API_VERSION} = {}) =>
    `${shopifyDomain}/admin/api/${adminApiVersion}/graphql.json`;

  const fetchAdminApi = <T>(
    document: string,
    {variables, headers, adminApiVersion}: Omit<AdminOptions, 'cache'>,
  ) =>
    fetchAdminGraphql<T>({
      url: getApiUrl({adminApiVersion}),
      token: privateAdminToken,
      document,
      variables,
      headers,
    });

  return {
    admin: {
      async query(query, {cache = CacheShort(), ...options} = {}) {
        const life = toCacheLife(cache);
        if (!withCache) {
          if (!life) return fetchAdminApi(query, options);
          try {
            return (await queryAdminCached({
              url: getApiUrl(options),
              document: query,
              variables: options.variables,
              headers: options.headers,
              life,
            })) as any;
          } catch {
            // Transport failures throw inside the cached function; retry live
            return fetchAdminApi(query, options);
          }
        }
        return withCache.run(
          {
            cacheKey: ['admin', getApiUrl(options), query, options.variables],
            cacheStrategy: cache,
            shouldCacheResult: (result) => !result.errors?.length,
            tags: [CACHE_TAGS.admin],
          },
          () => fetchAdminApi(query, options),
        );
      },
      mutate(mutation, options = {}) {
        return fetchAdminApi(mutation, options);
      },
      CacheNone,
      CacheLong,
      CacheShort,
      CacheCustom,
      generateCacheControlHeader,
      getShopifyDomain: () => shopifyDomain,
      getApiUrl,
      i18n,
    },
  };
}
