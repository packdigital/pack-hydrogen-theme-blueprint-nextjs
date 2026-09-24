import {
  createShopifyRequestContext,
  createStorefrontClient,
  type I18nConfig,
  type ShopifyRequestContext,
  type StorefrontClient,
} from '@shopify/hydrogen';
import {cacheLife, cacheTag} from 'next/cache';

import type {I18nLocale} from '~/lib/types';

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
} from './cache';
import {getEnv} from './env';

/**
 * Storefront API client with the same surface the React Router app used
 * (`storefront.query`, `storefront.mutate`, `storefront.i18n`,
 * `storefront.CacheLong()`...), implemented on the framework-agnostic
 * `createStorefrontClient` from `@shopify/hydrogen`.
 *
 * - Cached reads (any strategy other than `CacheNone`) run in a
 *   `'use cache: remote'` function on a `private_no_buyer_context` client,
 *   keyed only by locale, query and variables, so entries are shared across
 *   visitors and serverless instances. The proxy, where cache directives are
 *   unavailable, passes an in-memory `withCache` instead.
 * - Uncached reads and all mutations go through the request-scoped client,
 *   which forwards the buyer IP and Shopify tracking cookies.
 */

export type StorefrontApiErrors =
  | Array<{
      message: string;
      path?: ReadonlyArray<string | number>;
      extensions?: unknown;
    }>
  | undefined;

type QueryOptions = {
  variables?: Record<string, any>;
  cache?: CachingStrategy;
  displayName?: string;
};

export type Storefront = {
  i18n: I18nLocale;
  query: <T = any>(
    query: string,
    options?: QueryOptions,
  ) => Promise<T & {errors?: StorefrontApiErrors}>;
  mutate: <T = any>(
    mutation: string,
    options?: Omit<QueryOptions, 'cache'>,
  ) => Promise<T & {errors?: StorefrontApiErrors}>;
  CacheNone: typeof CacheNone;
  CacheLong: typeof CacheLong;
  CacheShort: typeof CacheShort;
  CacheCustom: typeof CacheCustom;
  generateCacheControlHeader: typeof generateCacheControlHeader;
  getShopifyDomain: () => string;
  getApiUrl: () => string;
  /** The request-scoped `@shopify/hydrogen` client (for Hydrogen handlers). */
  client: StorefrontClient;
  requestContext: ShopifyRequestContext;
};

export type StorefrontEnv = Pick<
  Env,
  | 'PUBLIC_STORE_DOMAIN'
  | 'PUBLIC_STOREFRONT_API_TOKEN'
  | 'PRIVATE_STOREFRONT_API_TOKEN'
  | 'PUBLIC_STOREFRONT_ID'
>;

type RequestLike = {
  headers: Headers;
  url?: string;
  method?: string;
  signal?: AbortSignal;
};

/**
 * Trusted buyer IP for private Storefront API requests. Vercel sets
 * `x-forwarded-for` (client IP first) and `x-real-ip`; Oxygen's header is
 * kept as a fallback so the app can still run behind Oxygen-style proxies.
 */
export function getBuyerIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    headers.get('x-real-ip') ||
    headers.get('oxygen-buyer-ip') ||
    undefined
  );
}

function toI18nConfig(i18n: I18nLocale): I18nConfig {
  return {
    country: i18n.country,
    language: i18n.language,
    pathPrefix: i18n.pathPrefix,
  } as I18nConfig;
}

export function createRequestContext(request: RequestLike, i18n: I18nLocale) {
  const buyerIp = getBuyerIp(request.headers);
  return buyerIp
    ? createShopifyRequestContext({request, i18n: toI18nConfig(i18n), buyerIp})
    : createShopifyRequestContext({request, i18n: toI18nConfig(i18n)});
}

export function createRequestStorefrontClient(
  requestContext: ShopifyRequestContext,
  env: StorefrontEnv,
): StorefrontClient {
  const storeDomain = env.PUBLIC_STORE_DOMAIN;
  const storefrontId = env.PUBLIC_STOREFRONT_ID;

  if (env.PRIVATE_STOREFRONT_API_TOKEN && requestContext.buyerIp) {
    return createStorefrontClient({
      type: 'private',
      requestContext: requestContext as ShopifyRequestContext & {
        readonly buyerIp: string;
      },
      config: {
        storeDomain,
        storefrontId,
        privateStorefrontToken: env.PRIVATE_STOREFRONT_API_TOKEN,
      },
    }) as StorefrontClient;
  }

  return createStorefrontClient({
    type: 'public',
    requestContext,
    config: {
      storeDomain,
      storefrontId,
      publicStorefrontToken: env.PUBLIC_STOREFRONT_API_TOKEN || undefined,
    },
  }) as StorefrontClient;
}

const sharedClients = new Map<string, StorefrontClient>();

/** Buyer-agnostic client used for cacheable catalog reads. */
function getSharedStorefrontClient(i18n: I18nLocale, env: StorefrontEnv) {
  const key = `${env.PUBLIC_STORE_DOMAIN}:${i18n.country}:${i18n.language}`;
  let client = sharedClients.get(key);
  if (!client) {
    const requestContext = createShopifyRequestContext({
      request: {headers: new Headers()},
      i18n: toI18nConfig(i18n),
    });
    client = (
      env.PRIVATE_STOREFRONT_API_TOKEN
        ? createStorefrontClient({
            type: 'private_no_buyer_context',
            requestContext,
            config: {
              storeDomain: env.PUBLIC_STORE_DOMAIN,
              storefrontId: env.PUBLIC_STOREFRONT_ID,
              privateStorefrontToken: env.PRIVATE_STOREFRONT_API_TOKEN,
            },
          })
        : createStorefrontClient({
            type: 'public',
            requestContext,
            config: {
              storeDomain: env.PUBLIC_STORE_DOMAIN,
              storefrontId: env.PUBLIC_STOREFRONT_ID,
              publicStorefrontToken:
                env.PUBLIC_STOREFRONT_API_TOKEN || undefined,
            },
          })
    ) as StorefrontClient;
    sharedClients.set(key, client);
  }
  return client;
}

async function runGraphql(
  targetClient: StorefrontClient,
  query: string,
  variables?: Record<string, any>,
) {
  const {data, errors} = await (targetClient.graphql as any)(query, {
    variables: variables || {},
  });
  return {data, errors: errors as StorefrontApiErrors};
}

/**
 * Cached Storefront API read. Only serializable, visitor-independent inputs
 * form the cache key; credentials are read from env inside. Results with
 * GraphQL errors are kept only briefly (`ERROR_CACHE_LIFE`); a transport
 * failure throws, so a failed background revalidation keeps serving the
 * previous entry until it expires.
 */
async function queryStorefrontCached({
  country,
  language,
  query,
  variables,
  life,
}: {
  country: I18nLocale['country'];
  language: I18nLocale['language'];
  query: string;
  variables?: Record<string, any>;
  life: CacheLifeProfile;
}) {
  'use cache: remote';
  cacheTag(CACHE_TAGS.storefront);

  const shared = getSharedStorefrontClient(
    {country, language, pathPrefix: ''} as I18nLocale,
    getEnv(),
  );
  const result = await runGraphql(shared, query, variables);
  cacheLife(result.errors?.length ? ERROR_CACHE_LIFE : life);
  return result;
}

function formatResult<T>(
  data: T | null | undefined,
  errors: StorefrontApiErrors,
) {
  return {...(data || {}), ...(errors?.length ? {errors} : {})} as T & {
    errors?: StorefrontApiErrors;
  };
}

export function createStorefront({
  env,
  i18n,
  requestContext,
  withCache,
}: {
  env: StorefrontEnv;
  i18n: I18nLocale;
  requestContext: ShopifyRequestContext;
  /** In-memory cache for contexts without cache directives (the proxy). */
  withCache?: WithCache;
}): Storefront {
  const client = createRequestStorefrontClient(requestContext, env);

  const run = runGraphql;

  return {
    i18n,
    client,
    requestContext,
    async query(query, options = {}) {
      const {variables, cache = CacheShort()} = options;
      if (cache.mode === 'no-store') {
        const {data, errors} = await run(client, query, variables);
        return formatResult(data, errors);
      }
      const life = toCacheLife(cache);
      if (!withCache && life) {
        try {
          const {data, errors} = await queryStorefrontCached({
            country: i18n.country,
            language: i18n.language,
            query,
            variables,
            life,
          });
          return formatResult(data, errors);
        } catch {
          // Transport failures throw inside the cached function; retry live
          const {data, errors} = await run(
            getSharedStorefrontClient(i18n, env),
            query,
            variables,
          );
          return formatResult(data, errors);
        }
      }
      const shared = getSharedStorefrontClient(i18n, env);
      if (!withCache) {
        const {data, errors} = await run(shared, query, variables);
        return formatResult(data, errors);
      }
      const {data, errors} = await withCache.run(
        {
          cacheKey: [
            'storefront',
            shared.apiUrl,
            i18n.country,
            i18n.language,
            query,
            variables,
          ],
          cacheStrategy: cache,
          shouldCacheResult: (result) => !result.errors?.length,
          tags: [CACHE_TAGS.storefront],
        },
        () => run(shared, query, variables),
      );
      return formatResult(data, errors);
    },
    async mutate(mutation, options = {}) {
      const {data, errors} = await run(client, mutation, options.variables);
      return formatResult(data, errors);
    },
    CacheNone,
    CacheLong,
    CacheShort,
    CacheCustom,
    generateCacheControlHeader,
    getShopifyDomain: () => `https://${env.PUBLIC_STORE_DOMAIN}`,
    getApiUrl: () => client.apiUrl,
  };
}
