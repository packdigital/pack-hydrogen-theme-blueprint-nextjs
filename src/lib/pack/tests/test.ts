import 'server-only';
import type {PackClient} from '@pack/client';
import * as cookie from 'cookie';
import createDebug from 'debug';

import {CACHE_TAGS, type WithCache} from '~/lib/server/cache';

import {PACK_EXPOSED_TEST_COOKIE_ID} from '../constants';
import type {PackTestSession} from '../test-session';
import type {
  PackRequestLike,
  Test,
  TestInfo,
  TestInput,
  TestTargetAudienceAttributes,
} from '../types';

import {getImpressionSectionIdsForVariant} from './impression';
import {LocalTestResolver, type TestWithRules} from './local-test-resolver';

export type {Test, TestInfo, TestInput, TestTargetAudienceAttributes};

const debug = createDebug('pack:ab-testing:test');

// Pack API query (no `#graphql` tag so Storefront codegen and validation skip it)
const QUERY_TESTS_BY_RULES = `
  query TestsByRules($status: String) {
    testsByRulesV2(status: $status) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          id
          handle
          rules {
            attribute
            operator
            value
          }
          impressionTrigger
          testVariants {
            id
            handle
            trafficPercentage
            sectionTestVariants {
              section {
                id
              }
            }
          }
        }
      }
    }
  }
`;

// Generate cache key for shared test rules (same for all users)
function generateTestRulesCacheKey(
  storeId: string,
  contentEnvironment?: string,
): string {
  return `pack-tests:${storeId}:${contentEnvironment || 'default'}`;
}

// Function to fetch test rules with shared caching (storefront-environment level)
async function fetchTestRulesShared(
  packClient: PackClient,
  withCache: WithCache,
  token: string,
): Promise<TestWithRules[]> {
  const baseCacheKey = generateTestRulesCacheKey(
    packClient.storeId || '',
    packClient.contentEnvironment,
  );

  debug(
    '[Pack Test] Fetching test rules with shared cache:',
    JSON.stringify({
      baseCacheKey,
      storeId: packClient.storeId,
      contentEnvironment: packClient.contentEnvironment,
    }),
  );

  // Check test cache timestamp to include in cache key for automatic invalidation
  // This is the only place where test-cache-check should be called
  let testsUpdatedAt: string | undefined;
  try {
    const resp = await withCache.run<{testsUpdatedAt?: string} | null>(
      {
        cacheKey: ['pack:tests:updatedAt'],
        cacheStrategy: {maxAge: 15, staleWhileRevalidate: 15},
        shouldCacheResult: (value) => value !== null,
        tags: [CACHE_TAGS.pack],
      },
      async ({addDebugData}) => {
        // Always use production endpoint for now
        const URL =
          'https://test-cache-check-production.packdigital.workers.dev/tests-updated-at';

        const resp = await fetch(URL, {
          headers: {Authorization: `Bearer ${token}`},
        });

        addDebugData?.({displayName: 'Pack Test Cache Check', response: resp});

        const {status} = resp;
        if (status !== 200) {
          let message;

          if (status === 401) {
            message =
              'Pack error: Unauthorized request to test cache check service. Please check your token.';
          } else {
            message = `Pack error: Request to test cache check service failed with status ${status}`;
          }

          debug(`[Pack Test] Cache check error: ${message}`);
          console.error(message);
          return null;
        }

        const data = await resp.json();
        debug('[Pack Test] Timestamp response:', JSON.stringify(data));
        return data as {testsUpdatedAt?: string} | null;
      },
    );

    testsUpdatedAt = resp?.testsUpdatedAt;
    debug(
      '[Pack Test] Using timestamp for cache key:',
      JSON.stringify({testsUpdatedAt, hasTimestamp: !!testsUpdatedAt}),
    );
  } catch (err) {
    debug(
      '[Pack Test] Error checking test cache timestamp:',
      JSON.stringify(err),
    );
    console.error('[Pack Test] Error checking test cache timestamp:', err);
  }

  // Include testsUpdatedAt in cache key for cache invalidation
  const cacheKey = testsUpdatedAt
    ? `${baseCacheKey}:${testsUpdatedAt}`
    : baseCacheKey;

  debug('[Pack Test] Final cache key for test rules:', cacheKey);

  return withCache.run<TestWithRules[]>(
    {
      cacheKey: [cacheKey],
      cacheStrategy: {
        maxAge: 3600, // 1 hour
        staleWhileRevalidate: 86400, // 24 hours
        staleIfError: 86400, // 24 hours
      },
      shouldCacheResult: (result) =>
        Array.isArray(result) && result.length >= 0,
      tags: [CACHE_TAGS.pack],
    },
    async ({addDebugData}) => {
      const startTime = Date.now();
      debug(
        '[Pack Test] Cache miss - fetching test rules from Pack GraphQL API',
      );

      try {
        // Fetch test rules from Pack API (only running tests)
        const {data, error} = await packClient.fetch(QUERY_TESTS_BY_RULES, {
          variables: {status: 'running'},
        });

        const fetchDuration = Date.now() - startTime;
        debug(
          '[Pack Test] GraphQL query completed:',
          JSON.stringify({
            duration: `${fetchDuration}ms`,
            hasData: !!data,
            hasError: !!error,
            totalCount: data?.testsByRulesV2?.totalCount,
            edgesCount: data?.testsByRulesV2?.edges?.length || 0,
          }),
        );

        addDebugData?.({displayName: 'Pack Test Rules Query'});

        if (error) {
          debug(
            '[Pack Test] Error fetching test rules:',
            JSON.stringify({
              error,
              errorType: typeof error,
              errorMessage: error?.message || JSON.stringify(error),
            }),
          );
          throw new Error(`GraphQL error: ${JSON.stringify(error)}`);
        }

        const rules: TestWithRules[] =
          data?.testsByRulesV2?.edges.map((edge: any) => edge.node) || [];

        debug(
          '[Pack Test] Successfully fetched and cached test rules:',
          JSON.stringify({
            rulesCount: rules.length,
            cacheKey,
            rules: rules.map((rule) => ({
              id: rule.id,
              handle: rule.handle,
              rulesCount: rule.rules?.length || 0,
              variantsCount: rule.testVariants?.length || 0,
            })),
          }),
        );

        return rules;
      } catch (error) {
        const fetchDuration = Date.now() - startTime;
        debug(
          '[Pack Test] Exception fetching test rules:',
          JSON.stringify({
            error: error instanceof Error ? error.message : error,
            duration: `${fetchDuration}ms`,
            stack: error instanceof Error ? error.stack : undefined,
          }),
        );
        throw error;
      }
    },
  );
}

export interface GetTestInfoOptions {
  request: PackRequestLike;
  testTargetAudienceAttributes: TestTargetAudienceAttributes | null;
  packClient: PackClient;
  testSession: PackTestSession;
  withCache?: WithCache;
  token?: string; // Pack secret token for cache check service
}

/** Speculative prefetches (e.g. `<link rel=prefetch>`, Speculation Rules) must not assign tests. */
function isPrefetchRequest(request: PackRequestLike) {
  const secPurpose = request.headers.get('sec-purpose')?.toLowerCase();
  const purpose = request.headers.get('purpose')?.toLowerCase();
  const xPurpose = request.headers.get('x-purpose')?.toLowerCase();
  return [secPurpose, purpose, xPurpose].some((value) =>
    value
      ?.split(',')
      .map((part) => part.trim())
      .includes('prefetch'),
  );
}

function toTestInfo(
  test: TestWithRules,
  variant: TestWithRules['testVariants'][number],
): TestInfo {
  const impressionSectionIds = getImpressionSectionIdsForVariant(test, variant);
  return {
    id: test.id,
    handle: test.handle,
    impressionTrigger: test.impressionTrigger,
    testVariant: {id: variant.id, handle: variant.handle},
    impression:
      impressionSectionIds.length > 0
        ? {sectionIds: impressionSectionIds}
        : undefined,
    isFirstExposure: undefined,
  };
}

async function packClientFetchTestByRules(
  packClient: PackClient,
  testTargetAudienceAttributes: TestTargetAudienceAttributes | null,
  testSession: PackTestSession,
  request: PackRequestLike,
  withCache?: WithCache,
  token?: string,
  exposedTest?: Test | null,
  validateOnly?: boolean,
): Promise<TestInfo | undefined> {
  // Rules only live for this evaluation; a per-call resolver avoids
  // concurrent requests swapping each other's rules mid-assignment.
  const localTestResolver = new LocalTestResolver();

  try {
    debug(
      '[Pack Test] Starting test assignment process:',
      JSON.stringify({
        storeId: packClient.storeId,
        targetingAttributes: testTargetAudienceAttributes,
        requestUrl: request.url,
        validateOnly,
      }),
    );

    if (!packClient.storeId) {
      debug('[Pack Test] Store ID is required to fetch a test.');
      console.error('[Pack Test] Store ID is required to fetch a test.');
      return undefined;
    }

    debug(
      '[Pack Test] Checking if rules are loaded:',
      JSON.stringify({hasRules: localTestResolver.hasRules()}),
    );

    // Always fetch rules through shared cache - it will return cached rules if still valid
    // This ensures we get fresh rules when tests are updated
    if (withCache && token) {
      debug('[Pack Test] Fetching test rules through shared cache');
      try {
        const rules = await fetchTestRulesShared(packClient, withCache, token);
        localTestResolver.setTestRules(rules);
        debug(
          '[Pack Test] Updated local resolver with rules from shared cache',
        );

        // Check if current session test is still in active rules and get fresh data
        const currentTestData = testSession.getTestData();
        let needsNewTest = false;

        if (currentTestData?.id) {
          const freshTestData = localTestResolver.getTestById(
            currentTestData.id,
          );

          if (!freshTestData) {
            debug(
              '[Pack Test] Current session test is no longer active (paused/stopped), clearing session:',
              JSON.stringify({
                testId: currentTestData.id,
                testHandle: currentTestData.handle,
              }),
            );
            testSession.clearTestData();
            needsNewTest = true; // Mark that we need to assign a new test
          } else {
            debug(
              '[Pack Test] Current session test is still active in rules, updating with fresh data:',
              JSON.stringify({
                testId: freshTestData.id,
                testHandle: freshTestData.handle,
                variantsCount: freshTestData.testVariants?.length,
              }),
            );

            // Check if the user's variant still exists
            if (currentTestData.testVariant?.id) {
              const currentVariant = freshTestData.testVariants?.find(
                (v) => v.id === currentTestData.testVariant.id,
              );

              if (currentVariant) {
                // Variant still exists, return refreshed test data
                const refreshedTest = toTestInfo(freshTestData, currentVariant);

                // Update session with refreshed data
                const {
                  isFirstExposure: _isFirstExposure,
                  ...testDataWithoutFlag
                } = refreshedTest;
                testSession.setTestData(testDataWithoutFlag);
                testSession.setExpireAt(getExpireAtDate().toISOString());

                // Return the refreshed test data (even in validateOnly mode)
                return refreshedTest;
              } else {
                // Variant no longer exists in test, clear session and need new test
                debug(
                  '[Pack Test] Current variant no longer exists in test, clearing session:',
                  JSON.stringify({
                    testId: currentTestData.id,
                    variantId: currentTestData.testVariant.id,
                  }),
                );
                testSession.clearTestData();
                needsNewTest = true;
              }
            }
          }
        }

        // If in validateOnly mode and test is still valid, we already returned above
        // If we need a new test (old one inactive), continue to assign even in validateOnly
        if (validateOnly && !needsNewTest) {
          debug('[Pack Test] Validation complete, no new test needed');
          return undefined;
        }
      } catch (error) {
        debug('[Pack Test] Failed to fetch test rules:', JSON.stringify(error));
        console.error('[Pack Test] Failed to fetch test rules:', error);
        // Continue without test rules
      }
    } else {
      debug(
        '[Pack Test] No withCache or token available - cannot fetch test rules',
      );
    }

    // Check if exposed test is still active and get fresh data
    if (exposedTest) {
      const freshTestData = localTestResolver.getTestById(exposedTest.id);
      if (freshTestData) {
        debug(
          '[Pack Test] Exposed test is still active in rules, restoring with fresh data:',
          JSON.stringify({
            testId: freshTestData.id,
            testHandle: freshTestData.handle,
          }),
        );

        // Find the variant in fresh data
        const exposedVariant = freshTestData.testVariants?.find(
          (v) => v.id === exposedTest.testVariant?.id,
        );

        if (exposedVariant) {
          // Return the exposed test with fresh data
          const result = toTestInfo(freshTestData, exposedVariant);

          // Save to session
          const {isFirstExposure: _isFirstExposure, ...testDataWithoutFlag} =
            result;
          testSession.setTestData(testDataWithoutFlag);
          testSession.setExpireAt(getExpireAtDate().toISOString());

          return result;
        } else {
          debug(
            '[Pack Test] Exposed test variant no longer exists in fresh data:',
            JSON.stringify({
              testId: exposedTest.id,
              variantId: exposedTest.testVariant?.id,
            }),
          );
        }
      } else {
        debug(
          '[Pack Test] Exposed test is no longer active in rules:',
          JSON.stringify({testId: exposedTest.id}),
        );
      }
    }

    // Use local resolver to assign test
    const sessionId = packClient.storeId; // Use store ID as session ID for consistency
    debug('[Pack Test] Assigning test with session ID:', sessionId);

    const assignedTest = await localTestResolver.assignTest(
      testTargetAudienceAttributes || {},
      sessionId,
    );

    debug(
      '[Pack Test] Test assignment result:',
      JSON.stringify({
        assigned: !!assignedTest,
        testId: assignedTest?.id,
        testHandle: assignedTest?.handle,
        variantId: assignedTest?.testVariant?.id,
        variantHandle: assignedTest?.testVariant?.handle,
      }),
    );

    if (!assignedTest) {
      debug('[Pack Test] No test assigned - user not eligible for any tests');
      return undefined;
    }

    // Return in the same format as the original implementation
    const result: TestInfo = {...assignedTest, isFirstExposure: true};

    debug(
      '[Pack Test] Test assigned, saving to session:',
      JSON.stringify({
        testId: result.id,
        testHandle: result.handle,
        variantId: result.testVariant.id,
        variantHandle: result.testVariant.handle,
      }),
    );

    // Save the assigned test to session WITHOUT isFirstExposure flag
    const {isFirstExposure: _isFirstExposure, ...testDataWithoutFlag} = result;
    testSession.setTestData(testDataWithoutFlag);
    testSession.setExpireAt(getExpireAtDate().toISOString());

    debug('[Pack Test] Returning test info with first exposure flag');
    return result;
  } catch (error) {
    debug(
      '[Pack Test] Error in packClientFetchTestByRules, continuing without test:',
      JSON.stringify(error),
    );
    console.error(
      '[Pack Test] Error in packClientFetchTestByRules, continuing without test:',
      error,
    );
    // Return undefined to allow site to load without test info
    return undefined;
  }
}

function getExpireAtDate() {
  const expireAt = new Date();
  expireAt.setHours(expireAt.getHours() + 4); // 4 hours
  return expireAt;
}

export async function getTestInfo({
  request,
  testTargetAudienceAttributes,
  packClient,
  testSession,
  withCache,
  token,
}: GetTestInfoOptions): Promise<TestInfo | undefined> {
  debug(
    '[Pack Test] Getting test info:',
    JSON.stringify({
      hasTestSession: !!testSession,
      targetingAttributes: testTargetAudienceAttributes,
      requestUrl: request.url,
    }),
  );

  if (isPrefetchRequest(request)) {
    debug('[Pack Test] Skipping test assignment for prefetch request.');
    return undefined;
  }

  let testInfo: TestInfo | undefined = undefined;
  let exposedTest: Test | undefined = undefined;

  if (!testSession) {
    debug('[Pack Test] No test session available, returning undefined');
    return testInfo;
  }

  // Retrieve simplified test data and expiry
  const testSessionData: Test | undefined = testSession.getTestData();
  const testSessionExpireAt: string | undefined = testSession.getExpireAt();

  debug(
    '[Pack Test] Session data check:',
    JSON.stringify({
      hasTestData: !!testSessionData,
      testId: testSessionData?.id,
      testHandle: testSessionData?.handle,
      variantId: testSessionData?.testVariant?.id,
      variantHandle: testSessionData?.testVariant?.handle,
      expireAt: testSessionExpireAt,
      isExpired: testSessionExpireAt
        ? new Date(testSessionExpireAt) < new Date()
        : false,
    }),
  );

  const exposedTestCookieString = cookie.parse(
    request.headers.get('cookie') || '',
  )?.[PACK_EXPOSED_TEST_COOKIE_ID];

  debug(
    '[Pack Test] Exposed test cookie check:',
    JSON.stringify({hasExposedTestCookie: !!exposedTestCookieString}),
  );

  // If we already have a test in the session, validate it's still active.
  // (3.2.7 no longer expires session tests by time; the rules decide.)
  if (testSessionData?.id && testSessionData?.testVariant) {
    debug('[Pack Test] Found existing test data in session');

    try {
      const validationResult = await packClientFetchTestByRules(
        packClient,
        testTargetAudienceAttributes,
        testSession,
        request,
        withCache,
        token,
        null,
        true, // validateOnly - but will assign new test if current is inactive
      );

      if (validationResult) {
        if (validationResult.id === testSessionData.id) {
          debug(
            '[Pack Test] Test is still active, using refreshed data',
            JSON.stringify({
              testId: validationResult.id,
              testHandle: validationResult.handle,
              variantId: validationResult.testVariant.id,
              variantHandle: validationResult.testVariant.handle,
            }),
          );
          // Same test, just refreshed - no first exposure
          return validationResult;
        }

        debug(
          '[Pack Test] Original test no longer active, new test assigned',
          JSON.stringify({
            oldTestId: testSessionData.id,
            newTestId: validationResult.id,
            newTestHandle: validationResult.handle,
            newVariantId: validationResult.testVariant.id,
            newVariantHandle: validationResult.testVariant.handle,
          }),
        );
        // New test was assigned, mark as first exposure
        return {...validationResult, isFirstExposure: true};
      }

      debug(
        '[Pack Test] Test is no longer active and no new test was assigned',
      );
      return undefined;
    } catch (error) {
      debug(
        '[Pack Test] Error validating test, using cached data:',
        JSON.stringify(error),
      );
      console.error(
        '[Pack Test] Error validating test, using cached data:',
        error,
      );
      // On error, still return the cached data
      return {...testSessionData, isFirstExposure: undefined};
    }
  }

  if (exposedTestCookieString) {
    try {
      exposedTest = JSON.parse(exposedTestCookieString);
      debug(
        '[Pack Test] Parsed exposed test from cookie:',
        JSON.stringify({
          testId: exposedTest?.id,
          testHandle: exposedTest?.handle,
          variantId: exposedTest?.testVariant?.id,
          variantHandle: exposedTest?.testVariant?.handle,
        }),
      );
    } catch (error) {
      debug(
        '[Pack Test] Failed to parse exposed test cookie:',
        JSON.stringify(error),
      );
      console.error('[Pack Test] Failed to parse exposed test cookie:', error);
    }
  }

  if (exposedTest && !testSessionData) {
    debug(
      '[Pack Test] Found exposed test cookie with no session data - will fetch rules and validate',
    );
    // If there is no assigned test on the session and an exposed test in the
    // incoming request cookie it means that the user was exposed to a test previously.
    try {
      testInfo = await packClientFetchTestByRules(
        packClient,
        testTargetAudienceAttributes,
        testSession,
        request,
        withCache,
        token,
        exposedTest,
        false, // Not validateOnly - allow assigning new tests
      );

      if (testInfo?.id === exposedTest.id) {
        debug('[Pack Test] Exposed test was restored (still active)');
      } else if (testInfo) {
        debug(
          '[Pack Test] Exposed test is no longer active, using newly assigned test:',
          JSON.stringify({
            exposedTestId: exposedTest.id,
            newTestId: testInfo.id,
          }),
        );
      } else {
        debug(
          '[Pack Test] Exposed test is no longer active and no new test was assigned',
        );
      }
    } catch (error) {
      debug(
        '[Pack Test] Error processing exposed test:',
        JSON.stringify(error),
      );
      console.error(
        '[Pack Test] Error processing exposed test, continuing without test:',
        error,
      );
      testInfo = undefined;
    }
  } else if (testSessionData) {
    debug(
      '[Pack Test] Test session data exists but was invalid - fetching new test',
    );
    testSession.clearTestData();

    try {
      testInfo = await packClientFetchTestByRules(
        packClient,
        testTargetAudienceAttributes,
        testSession,
        request,
        withCache,
        token,
        null,
        false, // Not validateOnly - allow assigning new tests
      );
    } catch (error) {
      debug(
        '[Pack Test] Error fetching new test after expired session:',
        JSON.stringify(error),
      );
      console.error(
        '[Pack Test] Error fetching new test, continuing without test:',
        error,
      );
      testInfo = undefined;
    }
  } else {
    debug(
      '[Pack Test] No existing test data found - fetching new test for user',
    );
    // If there is no test on session and no exposed test, check for a new test for client
    try {
      testInfo = await packClientFetchTestByRules(
        packClient,
        testTargetAudienceAttributes,
        testSession,
        request,
        withCache,
        token,
        null,
        false, // Not validateOnly - allow assigning new tests
      );
    } catch (error) {
      debug(
        '[Pack Test] Error fetching new test for user:',
        JSON.stringify(error),
      );
      console.error(
        '[Pack Test] Error fetching new test, continuing without test:',
        error,
      );
      testInfo = undefined;
    }
  }

  debug(
    '[Pack Test] Final test info result:',
    JSON.stringify({
      hasTestInfo: !!testInfo,
      testId: testInfo?.id,
      testHandle: testInfo?.handle,
      variantId: testInfo?.testVariant?.id,
      variantHandle: testInfo?.testVariant?.handle,
      isFirstExposure: testInfo?.isFirstExposure,
    }),
  );

  return testInfo;
}

export function hasCompleteTestInput(
  testInput: TestInput | null | undefined,
): testInput is TestInput {
  if (!testInput) return false;
  const hasTest = Boolean(testInput.testId || testInput.testHandle);
  const hasVariant = Boolean(
    testInput.testVariantId || testInput.testVariantHandle,
  );
  return hasTest && hasVariant;
}

export function getTestSession(
  testSession?: PackTestSession,
  explicitTest: TestInput | null = null,
  previewEnabled = false,
): Test | null | undefined {
  debug(
    '[Pack Test] Getting test session:',
    JSON.stringify({
      hasTestSession: !!testSession,
      hasExplicitTest: hasCompleteTestInput(explicitTest),
      previewEnabled,
    }),
  );

  if (hasCompleteTestInput(explicitTest)) {
    const result = {
      id: explicitTest.testId || '',
      handle: explicitTest.testHandle || '',
      testVariant: {
        id: explicitTest.testVariantId || '',
        handle: explicitTest.testVariantHandle || '',
      },
    };
    debug('[Pack Test] Using explicit test input:', JSON.stringify(result));
    return result;
  }

  if (previewEnabled) {
    const result = {
      id: '',
      handle: 'isPreview',
      testVariant: {id: '', handle: 'isPreview'},
    };
    debug(
      '[Pack Test] Using preview mode test session:',
      JSON.stringify(result),
    );
    return result;
  }

  if (!testSession) {
    debug('[Pack Test] No test session available');
    return undefined;
  }

  // Read simplified test data from the dedicated test session
  const testSessionData: Test | undefined = testSession.getTestData();
  debug(
    '[Pack Test] Retrieved test session data:',
    JSON.stringify({
      hasData: !!testSessionData,
      testId: testSessionData?.id,
      testHandle: testSessionData?.handle,
      variantId: testSessionData?.testVariant?.id,
      variantHandle: testSessionData?.testVariant?.handle,
    }),
  );

  return testSessionData || null;
}

export function getTestTargetingAttributesFromRequest(
  request: PackRequestLike,
): TestTargetAudienceAttributes {
  const testTargetingAttributes: TestTargetAudienceAttributes = {};

  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;

  testTargetingAttributes.url = requestUrl.origin + requestUrl.pathname;
  testTargetingAttributes.query = requestUrl.search;
  testTargetingAttributes.path = requestUrl.pathname;
  if (searchParams.has('utm_campaign'))
    testTargetingAttributes.utmCampaign =
      searchParams.get('utm_campaign') || undefined;
  if (searchParams.has('utm_content'))
    testTargetingAttributes.utmContent =
      searchParams.get('utm_content') || undefined;
  if (searchParams.has('utm_medium'))
    testTargetingAttributes.utmMedium =
      searchParams.get('utm_medium') || undefined;
  if (searchParams.has('utm_source'))
    testTargetingAttributes.utmSource =
      searchParams.get('utm_source') || undefined;
  if (searchParams.has('utm_term'))
    testTargetingAttributes.utmTerm = searchParams.get('utm_term') || undefined;

  return testTargetingAttributes;
}

export function getTestFromQueryParams(
  request: PackRequestLike,
): TestInput | null {
  const requestUrl = new URL(request.url);
  const params = requestUrl.searchParams;

  if (
    params.has('testId') ||
    params.has('test_id') ||
    params.has('test-id') ||
    params.has('testHandle') ||
    params.has('test_handle') ||
    params.has('test-handle') ||
    params.has('testVariantId') ||
    params.has('test_variant_id') ||
    params.has('test-variant-id') ||
    params.has('testVariantHandle') ||
    params.has('test_variant_handle') ||
    params.has('test-variant-handle')
  ) {
    return {
      testId:
        params.get('testId') ||
        params.get('test_id') ||
        params.get('test-id') ||
        '',
      testHandle:
        params.get('testHandle') ||
        params.get('test_handle') ||
        params.get('test-handle') ||
        '',
      testVariantId:
        params.get('testVariantId') ||
        params.get('test_variant_id') ||
        params.get('test-variant-id') ||
        '',
      testVariantHandle:
        params.get('testVariantHandle') ||
        params.get('test_variant_handle') ||
        params.get('test-variant-handle') ||
        '',
    };
  }

  return null;
}

export function setTestHeaders(
  headers: Record<string, string>,
  options: {
    testInfoForRequest?: TestInfo;
    testFromQueryParams?: TestInput | null;
  },
) {
  const {testFromQueryParams, testInfoForRequest} = options;

  if (testFromQueryParams) {
    // @pack/client merges these into its fetch headers; the original sent a
    // boolean here, which fetch serializes to "true".
    headers['X-Pack-Test-Ignore-Test-Status'] = 'true';

    if (testFromQueryParams.testId) {
      headers['X-Pack-Test-Id'] = testFromQueryParams.testId;
    }

    if (testFromQueryParams.testHandle) {
      headers['X-Pack-Test-Handle'] = testFromQueryParams.testHandle;
    }

    if (testFromQueryParams.testVariantId) {
      headers['X-Pack-Test-Variant-Id'] = testFromQueryParams.testVariantId;
    }

    if (testFromQueryParams.testVariantHandle) {
      headers['X-Pack-Test-Variant-Handle'] =
        testFromQueryParams.testVariantHandle;
    }
  } else if (testInfoForRequest) {
    headers['X-Pack-Test-Id'] = testInfoForRequest?.id;
    headers['X-Pack-Test-Variant-Id'] = testInfoForRequest?.testVariant?.id;
  }

  return headers;
}
