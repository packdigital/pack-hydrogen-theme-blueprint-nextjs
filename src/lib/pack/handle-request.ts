import 'server-only';
import * as cookie from 'cookie';

import {replaceRequestCookie} from '~/lib/server/cookie-session';

import {
  PACK_COOKIE_ID,
  PACK_EXPOSED_TEST_COOKIE_ID,
  PACK_POWERED_BY,
  PACK_TEST_COOKIE_ID,
} from './constants';
import type {Pack} from './create-pack-client';
import type {PackRequestHeaders} from './types';

/**
 * Replacements for `@pack/hydrogen`'s `handleRequest(pack, request, handler)`
 * wrapper. The Next proxy calls these around `NextResponse.next()` instead.
 */

/**
 * The client sets `exposedTest` once a visitor has been exposed to a test;
 * the server reads it on the next request, then clears it on the response.
 */
export function clearExposedTestCookie(
  request: PackRequestHeaders,
  responseHeaders: Headers,
) {
  const hasExposedTestCookie = request.headers
    .get('cookie')
    ?.includes(PACK_EXPOSED_TEST_COOKIE_ID);

  if (hasExposedTestCookie) {
    responseHeaders.append(
      'Set-Cookie',
      cookie.serialize(PACK_EXPOSED_TEST_COOKIE_ID, '', {
        maxAge: 0,
        expires: new Date(0),
        path: '/',
      }),
    );
  }
}

/**
 * Appends the Pack `Set-Cookie` headers: the main session always, the test
 * session only when it changed (fewer headers, fewer races between tabs).
 */
export async function commitPackSessions(pack: Pack, responseHeaders: Headers) {
  responseHeaders.append('powered-by', PACK_POWERED_BY);

  // Always commit main session
  responseHeaders.append('Set-Cookie', await pack.session.commit());

  // Only commit test session if there are actual changes
  if (pack.testSession && pack.testSession.hasChanges()) {
    responseHeaders.append('Set-Cookie', await pack.testSession.commit());
  }
}

/**
 * The incoming `Cookie` header with `__pack` and `__pack_test` replaced by the
 * sessions as they are now (new session id, freshly assigned test...), so
 * the render that follows the proxy reads the same state the response sets.
 */
export async function getForwardedPackCookies(
  pack: Pack,
  cookieHeader: string | null,
): Promise<string> {
  const [sessionPair, testSessionPair] = await Promise.all([
    pack.session.toRequestCookie(),
    pack.testSession.toRequestCookie(),
  ]);
  let header = replaceRequestCookie(cookieHeader, PACK_COOKIE_ID, sessionPair);
  header = replaceRequestCookie(header, PACK_TEST_COOKIE_ID, testSessionPair);
  return header;
}
