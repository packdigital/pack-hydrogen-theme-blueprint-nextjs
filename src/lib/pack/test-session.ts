import 'server-only';
import createDebug from 'debug';

import {CookieSession} from '~/lib/server/cookie-session';

import {PACK_COOKIE_MAX_AGE, PACK_TEST_COOKIE_ID} from './constants';
import {isSecureCookie} from './cookies-utils';
import type {PackRequestHeaders, Test} from './types';

const debug = createDebug('pack:ab-testing:test-session');

type InitialData = {
  test_data?: Test;
  test_expire_at?: string;
  test_rules_cache?: any[];
  test_rules_cache_timestamp?: number;
};

/**
 * The `__pack_test` session: the visitor's assigned A/B test and its expiry.
 * Port of `@pack/hydrogen@3.2.7`'s `PackTestSession`, backed by
 * `CookieSession`.
 */
export class PackTestSession {
  readonly id: string;
  readonly #session: CookieSession;
  #isDirty = false;
  #initialData: InitialData = {};

  constructor(id: string, session: CookieSession) {
    this.id = id;
    this.#session = session;

    // Store initial state to track changes
    this.#initialData = {
      test_data: this.#session.get('test_data'),
      test_expire_at: this.#session.get('test_expire_at'),
      test_rules_cache: this.#session.get('test_rules_cache'),
      test_rules_cache_timestamp: this.#session.get(
        'test_rules_cache_timestamp',
      ),
    };
  }

  static async init(
    request: PackRequestHeaders,
    secrets: string[],
  ): Promise<PackTestSession> {
    const userAgent = request.headers.get('User-Agent');
    debug('[PackTestSession.init] Initializing test session', {
      hasSecrets: secrets.length > 0,
      userAgent: userAgent?.substring(0, 50),
    });

    const session = await CookieSession.init(request.headers.get('Cookie'), {
      name: PACK_TEST_COOKIE_ID,
      secrets,
      // React Router's createCookie did not set HttpOnly; keep parity.
      httpOnly: false,
      secure: isSecureCookie(request),
      sameSite: 'lax',
      maxAge: PACK_COOKIE_MAX_AGE,
      path: '/',
    });

    let sessionId = session.get<string>('test_session_id');

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      session.set('test_session_id', sessionId);
      debug('[PackTestSession.init] Generated new session ID', {sessionId});
    } else {
      debug('[PackTestSession.init] Using existing session ID', {sessionId});
    }

    return new this(sessionId, session);
  }

  /** True once the underlying cookie session has been written to. */
  get isPending() {
    return this.#session.isPending;
  }

  getTestData(): Test | undefined {
    const testData = this.#session.get('test_data');
    debug('[getTestData] Called', {
      sessionId: this.id,
      hasTestData: !!testData,
      hasIsFirstExposure: testData && 'isFirstExposure' in testData,
      isFirstExposure: testData ? testData.isFirstExposure : undefined,
      testId: testData?.id,
      testHandle: testData?.handle,
    });

    if (testData && 'isFirstExposure' in testData) {
      // Strip isFirstExposure flag from stored session data and re-save clean data
      const {isFirstExposure, ...cleanTestData} = testData;
      debug(
        '[getTestData] Cleaning session data, removing isFirstExposure flag',
        {sessionId: this.id, isFirstExposure},
      );
      this.#session.set('test_data', cleanTestData);
      this.#isDirty = true;
      return cleanTestData;
    }
    return testData;
  }

  getExpireAt(): string | undefined {
    return this.#session.get('test_expire_at');
  }

  setTestData(testData: Test | undefined): void {
    debug('[setTestData] Setting test data', {
      sessionId: this.id,
      testId: testData?.id,
      testHandle: testData?.handle,
      variantId: testData?.testVariant?.id,
      variantHandle: testData?.testVariant?.handle,
    });
    this.#isDirty = true;
    this.#session.set('test_data', testData);
  }

  setExpireAt(expireAt: string | undefined): void {
    debug('[setExpireAt] Setting expiry', {sessionId: this.id, expireAt});
    this.#isDirty = true;
    this.#session.set('test_expire_at', expireAt);
  }

  clearTestData(): void {
    debug('[clearTestData] Clearing test data and expiry', {
      sessionId: this.id,
    });
    this.#isDirty = true;
    this.#session.unset('test_data');
    this.#session.unset('test_expire_at');
  }

  hasTestData(): boolean {
    return this.#session.has('test_data');
  }

  // Test rules cache methods
  getTestRulesCache(): any[] | undefined {
    return this.#session.get('test_rules_cache');
  }

  getTestRulesCacheTimestamp(): number | undefined {
    return this.#session.get('test_rules_cache_timestamp');
  }

  setTestRulesCache(rules: any[], timestamp: number): void {
    debug('[setTestRulesCache] Caching test rules', {
      sessionId: this.id,
      rulesCount: rules.length,
      timestamp: new Date(timestamp).toISOString(),
    });
    this.#isDirty = true;
    this.#session.set('test_rules_cache', rules);
    this.#session.set('test_rules_cache_timestamp', timestamp);
  }

  clearTestRulesCache(): void {
    debug('[clearTestRulesCache] Clearing rules cache', {sessionId: this.id});
    this.#isDirty = true;
    this.#session.unset('test_rules_cache');
    this.#session.unset('test_rules_cache_timestamp');
  }

  isTestRulesCacheValid(cacheDurationMs: number = 60 * 60 * 1000): boolean {
    const timestamp = this.getTestRulesCacheTimestamp();
    if (!timestamp) {
      debug('[isTestRulesCacheValid] No cache timestamp found', {
        sessionId: this.id,
      });
      return false;
    }

    const isValid = Date.now() - timestamp < cacheDurationMs;
    debug('[isTestRulesCacheValid] Cache validity check', {
      sessionId: this.id,
      isValid,
      cacheAge: Math.floor((Date.now() - timestamp) / 1000) + 's',
      maxAge: Math.floor(cacheDurationMs / 1000) + 's',
    });
    return isValid;
  }

  hasChanges(): boolean {
    // Check if data has actually changed
    const currentTestData = this.getTestData();
    const currentExpireAt = this.getExpireAt();
    const currentTestRulesCache = this.getTestRulesCache();
    const currentTestRulesCacheTimestamp = this.getTestRulesCacheTimestamp();

    // Compare with initial state
    const testDataChanged =
      JSON.stringify(currentTestData) !==
      JSON.stringify(this.#initialData.test_data);
    const expireAtChanged =
      currentExpireAt !== this.#initialData.test_expire_at;
    const testRulesCacheChanged =
      JSON.stringify(currentTestRulesCache) !==
      JSON.stringify(this.#initialData.test_rules_cache);
    const testRulesCacheTimestampChanged =
      currentTestRulesCacheTimestamp !==
      this.#initialData.test_rules_cache_timestamp;

    const hasChanges =
      testDataChanged ||
      expireAtChanged ||
      testRulesCacheChanged ||
      testRulesCacheTimestampChanged ||
      this.#isDirty;

    debug('[hasChanges] Checking for changes', {
      sessionId: this.id,
      hasChanges,
      testDataChanged,
      expireAtChanged,
      testRulesCacheChanged,
      testRulesCacheTimestampChanged,
      isDirty: this.#isDirty,
    });

    return hasChanges;
  }

  commit(): Promise<string> {
    debug('[commit] Committing session', {
      sessionId: this.id,
      isDirty: this.#isDirty,
      hasTestData: !!this.getTestData(),
    });
    // Reset dirty flag after commit
    this.#isDirty = false;

    // Update initial data to current state
    this.#initialData = {
      test_data: this.getTestData(),
      test_expire_at: this.getExpireAt(),
      test_rules_cache: this.getTestRulesCache(),
      test_rules_cache_timestamp: this.getTestRulesCacheTimestamp(),
    };

    return this.#session.commit();
  }

  /** `name=value` pair so the proxy can forward the sealed session to the render. */
  toRequestCookie(): Promise<string> {
    return this.#session.toRequestCookie();
  }

  async destroy(): Promise<string> {
    debug('[destroy] Destroying session', {sessionId: this.id});
    this.#isDirty = true;
    this.#session.unset('test_data');
    this.#session.unset('test_expire_at');
    this.#session.unset('test_rules_cache');
    this.#session.unset('test_rules_cache_timestamp');
    return this.#session.destroy();
  }
}
