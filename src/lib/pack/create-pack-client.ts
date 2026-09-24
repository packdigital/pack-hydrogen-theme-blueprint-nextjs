import 'server-only';
import {PackClient} from '@pack/client';
import createDebug from 'debug';
import {cacheLife, cacheTag} from 'next/cache';

import {
  CACHE_TAGS,
  CacheCustom,
  ERROR_CACHE_LIFE,
  toCacheLife,
  type CacheLifeProfile,
  type CachingStrategy,
  type WithCache,
} from '~/lib/server/cache';
import {getEnv} from '~/lib/server/env';

import type {PackSession} from './session';
import type {PackTestSession} from './test-session';
import {
  getTestFromQueryParams,
  getTestInfo,
  getTestSession,
  getTestTargetingAttributesFromRequest,
  hasCompleteTestInput,
  setTestHeaders,
} from './tests/test';
import {clearExposedTestCookie} from './handle-request';
import type {
  PackCustomizerMeta,
  PackRequestLike,
  Test,
  TestInfo,
  TestInput,
} from './types';

export type {CachingStrategy, PackCustomizerMeta, Test, TestInfo, TestInput};

const debug = createDebug('pack:ab-testing:create-pack-client');

export interface I18nOptions {
  language: string;
  country: string;
}

export interface DefaultThemeData {
  data: Record<string, any>;
}

export interface CreatePackClientOptions {
  /**
   * In-memory cache for A/B test rules (`createMemoryWithCache()`). Content
   * queries and the publish-timestamp check are `'use cache: remote'`
   * functions instead. Replaces Hydrogen's `cache` + `waitUntil`.
   */
  withCache: WithCache;
  apiUrl?: string;
  token?: string;
  storeId?: string;
  session: PackSession;
  testSession: PackTestSession;
  contentEnvironment?: string;
  i18n?: I18nOptions;
  /** Default theme data to use when no token is provided */
  defaultThemeData?: DefaultThemeData;
  /**
   * The request (or `{url, headers}`) used for query-param test overrides,
   * targeting attributes and the `exposedTest` cookie. Can also be captured
   * from the first `handleRequest()` call.
   */
  request?: PackRequestLike;
  /**
   * Test info already resolved by the proxy (see `resolveTestInfo()`). When
   * provided (including `null` = "resolved, no test"), `query()` uses it
   * instead of running test assignment, since the render cannot write the
   * `__pack_test` cookie that assignment updates.
   */
  resolvedTestInfo?: TestInfo | null;
}

type Variables = Record<string, any>;

export interface QueryOptions {
  variables?: Variables;
  cache?: CachingStrategy;
  test?: TestInput;
}

export interface QueryError {
  message: string;
  param?: string;
  code?: string;
  type: string;
}

export interface QueryResponse<T> {
  data: T | null;
  error: QueryError | null;
  packTestInfo?: Test;
}

export interface Pack {
  abTest: Test | null | undefined;
  /**
   * @deprecated The method should not be used
   */
  getPackSessionData(): {
    storeId: string;
    sessionId: string;
    abTest: Test | null | undefined;
    isPreviewModeEnabled: boolean;
    customizerMeta: any;
  };
  getPackContextData(): {
    packStoreId: string;
    packSessionId: string;
    packAbTest: Test | null | undefined;
    packIsPreviewMode: boolean;
    packCustomizerMeta: PackCustomizerMeta | null;
  };
  /**
   * Captures the request (if not passed to `createPackClient`) and returns a
   * callback that clears the `exposedTest` cookie on the response. Prefer
   * `clearExposedTestCookie()` in the proxy.
   */
  handleRequest(
    request: PackRequestLike,
  ): Promise<(response: Response) => void>;
  isPreviewModeEnabled: () => boolean;
  isValidEditToken: PackClient['isValidEditToken'];
  query: <T = any>(
    query: string,
    options?: QueryOptions,
  ) => Promise<QueryResponse<T>>;
  /**
   * Runs the A/B test assignment the first `query()` would run (mutating
   * `testSession`), once per client. For the proxy, which then commits the
   * test session and forwards the result to the render.
   */
  resolveTestInfo(): Promise<TestInfo | undefined>;
  session: PackSession;
  testSession: PackTestSession;
}

const PACK_CLIENT_NAME = 'HydrogenClient';

/**
 * Pack's publish timestamp (15s cache). Part of every cached content query's
 * key, so publishing content in Pack invalidates cached queries. The token is
 * read from env (`PACK_SECRET_TOKEN`) so it stays out of the cache key;
 * failures throw and are not cached.
 */
async function getPackPublishedAt(): Promise<string | null> {
  'use cache: remote';
  cacheLife({stale: 15, revalidate: 15, expire: 30});
  cacheTag(CACHE_TAGS.pack);

  const resp = await fetch(
    'https://cache-check-production.packdigital.workers.dev/published-at',
    {headers: {Authorization: `Bearer ${getEnv().PACK_SECRET_TOKEN}`}},
  );
  if (resp.status !== 200) {
    const message =
      resp.status === 401
        ? 'Pack error: Unauthorized request to cache check service. Please check your token.'
        : `Pack error: Request to cache check service failed with status ${resp.status}`;
    debug(`Cache check error: ${message}`);
    throw new Error(message);
  }
  const body = (await resp.json()) as {publishedAt?: string};
  return body.publishedAt ?? null;
}

/**
 * Cached published-content query. Keyed by the query, variables, A/B test
 * headers, store/environment and the publish timestamp — not by the visitor's
 * Pack session. Preview mode never reaches this (it bypasses the cache).
 */
async function queryPackCached({
  query,
  variables,
  headers,
  storeId,
  contentEnvironment,
  apiUrl,
  publishedAt,
  life,
}: {
  query: string;
  variables: Variables;
  headers: Record<string, string>;
  storeId?: string;
  contentEnvironment?: string;
  apiUrl?: string;
  publishedAt: string | null;
  life: CacheLifeProfile;
}): Promise<{data: any; error: any}> {
  'use cache: remote';
  cacheTag(CACHE_TAGS.pack);
  void publishedAt; // cache key only

  const client = new PackClient({
    apiUrl,
    storeId,
    token: getEnv().PACK_SECRET_TOKEN,
    contentEnvironment,
    clientName: PACK_CLIENT_NAME,
  });
  const result = await client.fetch(query, {variables, headers});
  cacheLife(result.error ? ERROR_CACHE_LIFE : life);
  return result;
}

// Extends the CacheLong strategy with a stale-if-error policy
const cacheCustom = CacheCustom({
  maxAge: 3600,
  staleWhileRevalidate: 82800,
  staleIfError: 86400, // 1 day
});

/** Resolves the default data for a given query based on the theme config */
function resolveQuery({
  query,
  variables,
  defaultThemeData,
}: {
  query: string;
  variables?: Variables;
  defaultThemeData: DefaultThemeData;
}): any {
  const queryField = extractTopLevelField(query);
  const identifier = variables?.handle || variables?.id;

  const defaultDataForField = defaultThemeData.data[queryField];
  if (!defaultDataForField) {
    return null;
  }

  return {
    [queryField]: identifier
      ? defaultDataForField[identifier]
      : defaultDataForField,
  };
}

/**
 * Extracts the top-level field from a GraphQL query string, e.g. `product`
 * from `query GetProduct($id: ID!) { product(id: $id) { id } }`.
 */
function extractTopLevelField(query: string): string {
  const match = query.match(/\{[^{]*?\w+(?=\(|:|\s*\{)/);
  if (match) {
    return match[0].slice(1).trim();
  }
  return '';
}

/**
 * Port of `@pack/hydrogen@3.2.7`'s `createPackClient` for Next.js. Same
 * `Pack` surface, plus `resolveTestInfo()`; published-content queries are
 * cached with `'use cache: remote'`, and test assignment can be supplied via
 * `resolvedTestInfo`.
 */
export function createPackClient(options: CreatePackClientOptions): Pack {
  const {
    withCache,
    session,
    testSession,
    contentEnvironment,
    storeId,
    token,
    apiUrl,
    defaultThemeData,
    i18n,
    request,
    resolvedTestInfo,
  } = options;

  const previewEnabled = !!session.get('previewEnabled');
  const previewEnvironment = session.get('environment');
  const locale = session.get('locale');
  const pageDraft = session.get('pageDraft');
  const siteSettingsDraft = session.get('siteSettingsDraft');
  const testHandle = session.get('testHandle');
  const testVariantHandle = session.get('testVariantHandle');

  const clientContentEnvironment = previewEnvironment || contentEnvironment;

  const hasResolvedTestInfo = resolvedTestInfo !== undefined;
  let testInfoForRequest: TestInfo | undefined = resolvedTestInfo ?? undefined;
  let testInfoPromise: Promise<TestInfo | undefined> | undefined = undefined;
  let currentRequest: PackRequestLike | undefined = request;
  let testFromQueryParams: TestInput | null = request
    ? getTestFromQueryParams(request)
    : null;

  const testFromPreviewSession: TestInput | null =
    previewEnabled && testHandle && testVariantHandle
      ? {testId: '', testHandle, testVariantId: '', testVariantHandle}
      : null;
  const getExplicitTestForSession = () =>
    hasCompleteTestInput(testFromQueryParams)
      ? testFromQueryParams
      : testFromPreviewSession;
  const getCurrentAbTest = () =>
    getTestSession(testSession, getExplicitTestForSession(), previewEnabled);

  if (!token && !defaultThemeData) {
    throw new Error(
      'ERR_HY_MISSING_TOKEN: The Pack client token is missing or empty. Please provide a valid token or default theme data. Doc: https://docs.packdigital.com/err/ERR_HY_MISSING_TOKEN',
    );
  }

  if (!storeId) {
    throw new Error(
      'ERR_HY_MISSING_STORE_ID: The Pack Store ID is missing or empty. Please provide a valid Store ID. Doc: https://docs.packdigital.com/err/ERR_HY_MISSING_STORE_ID',
    );
  }

  const handleRequest = async (request: PackRequestLike) => {
    // Store the request for use in query() if not already provided
    if (!currentRequest) {
      currentRequest = request;
      testFromQueryParams = getTestFromQueryParams(request);
    }

    return (response: Response) => {
      clearExposedTestCookie(request, response.headers);
    };
  };

  const getPackSessionData = () => ({
    storeId,
    sessionId: session.id,
    abTest: getCurrentAbTest(),
    isPreviewModeEnabled: previewEnabled,
    customizerMeta: session.get('customizerMeta'),
  });

  const getPackContextData = () => ({
    packStoreId: storeId,
    packSessionId: session.id,
    packAbTest: getCurrentAbTest(),
    packIsPreviewMode: previewEnabled,
    packCustomizerMeta: (session.get('customizerMeta') ??
      null) as PackCustomizerMeta | null,
  });

  if (!token) {
    return {
      get abTest() {
        return getCurrentAbTest();
      },
      handleRequest,
      getPackSessionData,
      getPackContextData,
      isPreviewModeEnabled: () => previewEnabled,
      // The original returned a promise that never settled; resolve instead
      // so the edit route can answer 401.
      isValidEditToken: () => Promise.resolve(false),
      resolveTestInfo: () => Promise.resolve(undefined),
      async query<T = any>(
        query: string,
        {variables}: QueryOptions = {},
      ): Promise<QueryResponse<T>> {
        if (!defaultThemeData?.data) {
          debug('Warning: Invalid default theme data provided to Pack client');
          console.warn('Invalid default theme data provided to Pack client.');
          return {data: null, error: null};
        }

        const data = resolveQuery({query, variables, defaultThemeData});

        return {data: data as T, error: null};
      },
      session,
      testSession,
    };
  }

  const resolvedApiUrl = apiUrl
    ? apiUrl
    : previewEnabled || process.env.NODE_ENV === 'development'
      ? 'https://app.packdigital.com/graphql'
      : undefined;

  const packClient = new PackClient({
    // Use apiUrl, it is configured
    // Use active API URL if preview mode is enabled
    // Otherwise, Live PackClient uses its internal configuration
    apiUrl: resolvedApiUrl,
    storeId,
    token,
    contentEnvironment: clientContentEnvironment,
    sessionId: session.id,
    clientName: PACK_CLIENT_NAME,
    locale,
    pageDraft,
    siteSettingsDraft,
    testHandle,
    testVariantHandle,
    // When in preview mode, ignore test status to allow previewing draft tests
    ignoreTestStatus: previewEnabled,
  });

  /** Test assignment is skipped in preview and when a test is forced explicitly. */
  const shouldResolveTestInfo = (explicitTest?: TestInput | null) =>
    !previewEnabled && !explicitTest;

  /** Memoized `getTestInfo` for this client (one assignment per request). */
  const runTestInfo = async (): Promise<TestInfo | undefined> => {
    if (hasResolvedTestInfo || testInfoForRequest || !currentRequest) {
      return testInfoForRequest;
    }

    try {
      if (!testInfoPromise) {
        debug(
          '[Pack Test] Creating getTestInfo promise - first query for this request',
        );
        testInfoPromise = getTestInfo({
          request: currentRequest,
          testTargetAudienceAttributes:
            getTestTargetingAttributesFromRequest(currentRequest),
          packClient,
          testSession, // Use dedicated test session instead
          withCache,
          token,
        });
      } else {
        debug(
          '[Pack Test] Reusing existing getTestInfo promise - concurrent query',
        );
      }
      testInfoForRequest = await testInfoPromise;
    } catch (error) {
      debug(
        '[Pack Test] Error getting test info, continuing without test:',
        error,
      );
      console.error(
        '[Pack Test] Error getting test info, continuing without test:',
        error,
      );
      // Continue without test info to allow site to load
      testInfoForRequest = undefined;
      testInfoPromise = undefined; // Reset promise so it can be retried on next query
    }

    return testInfoForRequest;
  };

  return {
    get abTest() {
      return getCurrentAbTest();
    },
    getPackSessionData,
    getPackContextData,
    handleRequest,
    isPreviewModeEnabled: () => previewEnabled,
    isValidEditToken: (token: string | null) =>
      packClient.isValidEditToken(token),
    async resolveTestInfo() {
      if (!shouldResolveTestInfo(testFromQueryParams)) return undefined;
      return runTestInfo();
    },
    async query<T = any>(
      query: string,
      {variables, cache: strategy = cacheCustom, test}: QueryOptions = {},
    ): Promise<QueryResponse<T>> {
      try {
        let testInfoForLoader: Test | undefined = undefined;

        const queryVariables: Variables = variables ? {...variables} : {};
        queryVariables.version = previewEnabled ? 'CURRENT' : 'PUBLISHED';

        // Add locale to variables if it exists
        if (i18n) {
          queryVariables.language = i18n.language;
          queryVariables.country = i18n.country;
        }

        const explicitTest = testFromQueryParams || test;
        const resolveTestInfo = shouldResolveTestInfo(explicitTest);

        if (resolveTestInfo) {
          const hadTestInfo = !!testInfoForRequest;
          await runTestInfo();
          if (hadTestInfo) {
            debug('[Pack Test] Using cached testInfo - subsequent query');
          }
        }

        if (resolveTestInfo && testInfoForRequest?.isFirstExposure) {
          const {isFirstExposure: _isFirstExposure, ...testInfo} =
            testInfoForRequest;

          testInfoForLoader = testInfo;
        }

        const headers = setTestHeaders(
          {},
          {testInfoForRequest, testFromQueryParams: explicitTest},
        );

        // Preview mode always bypasses the cache
        if (previewEnabled) {
          try {
            const result = await packClient.fetch(query, {
              variables: queryVariables,
              headers,
            });

            return {...result, packTestInfo: testInfoForLoader};
          } catch (error) {
            return {error: error as QueryError, data: null};
          }
        }

        const fetchLive = async () => {
          try {
            return await packClient.fetch(query, {
              variables: queryVariables,
              headers,
            });
          } catch (error) {
            return {error, data: null};
          }
        };

        const life = toCacheLife(strategy);
        let response: {data: any; error: any};
        if (!life) {
          response = await fetchLive();
        } else {
          const publishedAt = await getPackPublishedAt().catch((error) => {
            debug(`Error getting cache key: ${error}`);
            console.error(error);
            return null;
          });
          try {
            response = await queryPackCached({
              query,
              variables: queryVariables,
              headers,
              storeId,
              contentEnvironment: clientContentEnvironment,
              apiUrl: resolvedApiUrl,
              publishedAt,
              life,
            });
          } catch {
            // Transport failures throw inside the cached function; retry live
            response = await fetchLive();
          }
        }

        return response.error
          ? response
          : {...response, packTestInfo: testInfoForLoader};
      } catch (error) {
        debug(
          '[Pack Test] Critical error in query method, returning error:',
          error,
        );
        console.error(
          '[Pack Test] Critical error in query method, returning error:',
          error,
        );
        const queryError: QueryError = {
          message: error instanceof Error ? error.message : String(error),
          type: 'NetworkError',
        };
        return {error: queryError, data: null};
      }
    },
    session,
    testSession,
  };
}
