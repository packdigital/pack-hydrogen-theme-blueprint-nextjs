import 'server-only';

import defaultThemeData from '~/config/default-theme-data.json';
import type {WithCache} from '~/lib/server/cache';
import {getEnv} from '~/lib/server/env';

import {
  createPackClient,
  type I18nOptions,
  type Pack,
} from './create-pack-client';
import {PackSession} from './session';
import {PackTestSession} from './test-session';
import type {PackRequestLike, TestInfo} from './types';

/**
 * Server entry point for the vendored port of `@pack/hydrogen` (+
 * `@pack/packlytics`). Client hooks and components live in
 * `~/lib/pack/client`.
 */

export {createPackClient} from './create-pack-client';
export type {
  CachingStrategy,
  CreatePackClientOptions,
  DefaultThemeData,
  I18nOptions,
  Pack,
  QueryError,
  QueryOptions,
  QueryResponse,
} from './create-pack-client';
export {PackSession} from './session';
export {PackTestSession} from './test-session';
export {
  clearExposedTestCookie,
  commitPackSessions,
  getForwardedPackCookies,
} from './handle-request';
export {
  getResolvedTestInfo,
  setResolvedTestInfoHeader,
} from './resolved-test-info';
export {previewModeAction, previewModeLoader} from './preview-mode';
export {handlePacklyticsTrack, isPacklyticsTrackRequest} from './packlytics';
export {
  PACK_COOKIE_ID,
  PACK_EXPOSED_TEST_COOKIE_ID,
  PACK_TEST_COOKIE_ID,
  PACK_TEST_INFO_HEADER,
} from './constants';
export type {
  PackCustomizerMeta,
  PackRequestHeaders,
  PackRequestLike,
  Test,
  TestInfo,
  TestInput,
} from './types';

type PackEnv = Pick<
  Env,
  | 'PACK_SECRET_TOKEN'
  | 'PACK_STOREFRONT_ID'
  | 'PUBLIC_PACK_CONTENT_ENVIRONMENT'
  | 'SESSION_SECRET'
>;

export type CreatePackForRequestOptions = {
  /** A `Request`, or `{url, headers}` rebuilt from `headers()` in the render. */
  request: PackRequestLike;
  withCache: WithCache;
  /** Defaults to `getEnv()`. */
  env?: PackEnv;
  i18n?: I18nOptions;
  /** From `getResolvedTestInfo(headers)` in the render; omit in the proxy. */
  resolvedTestInfo?: TestInfo | null;
};

/**
 * Inits the `__pack` and `__pack_test` sessions from the request cookies and
 * creates the Pack client, as `server.ts` did on Oxygen.
 */
export async function createPackForRequest({
  request,
  withCache,
  env = getEnv(),
  i18n,
  resolvedTestInfo,
}: CreatePackForRequestOptions): Promise<Pack> {
  if (!env.SESSION_SECRET) {
    throw new Error('`SESSION_SECRET` environment variable is not set.');
  }

  const secrets = [env.SESSION_SECRET];
  const [session, testSession] = await Promise.all([
    PackSession.init(request, secrets),
    PackTestSession.init(request, secrets),
  ]);

  return createPackClient({
    withCache,
    token: env.PACK_SECRET_TOKEN,
    storeId: env.PACK_STOREFRONT_ID,
    session,
    testSession,
    contentEnvironment: env.PUBLIC_PACK_CONTENT_ENVIRONMENT,
    defaultThemeData,
    i18n,
    request,
    resolvedTestInfo,
  });
}
