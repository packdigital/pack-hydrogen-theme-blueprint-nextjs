import 'server-only';

import {CookieSession} from '~/lib/server/cookie-session';

import {PACK_COOKIE_ID, PACK_COOKIE_MAX_AGE} from './constants';
import {buildRandomUUID, hasUserConsent, isSecureCookie} from './cookies-utils';
import type {PackRequestHeaders} from './types';

/**
 * The `__pack` session: Pack session id (for analytics and A/B testing) and
 * the customizer's preview-mode state. Port of `@pack/hydrogen`'s
 * `PackSession`, backed by `CookieSession` instead of React Router's cookie
 * session storage.
 */
export class PackSession {
  readonly id: string;

  readonly secret: string;

  readonly #session: CookieSession;

  constructor(id: string, secret: string, session: CookieSession) {
    this.id = id;
    this.secret = secret;
    this.#session = session;
  }

  static async init(
    request: PackRequestHeaders,
    secrets: string[],
  ): Promise<PackSession> {
    const session = await CookieSession.init(request.headers.get('Cookie'), {
      name: PACK_COOKIE_ID,
      secrets,
      // React Router's createCookie did not set HttpOnly; keep parity.
      httpOnly: false,
      secure: isSecureCookie(request),
      sameSite: 'none',
      maxAge: PACK_COOKIE_MAX_AGE,
      path: '/',
    });

    let sessionId = session.get<string>('session_id');

    // Without consent, never persist an id across requests
    if (!sessionId || !hasUserConsent(request)) {
      sessionId = buildRandomUUID();
      session.set('session_id', sessionId);
    }

    return new this(sessionId, secrets[0], session);
  }

  /** True once the session has been written to (always true for a new session id). */
  get isPending() {
    return this.#session.isPending;
  }

  has(key: string): boolean {
    return this.#session.has(key);
  }

  get(key: string): any {
    return this.#session.get(key);
  }

  /** Clears the session and returns a `Set-Cookie` value expiring the cookie. */
  async destroy(): Promise<string> {
    return this.#session.destroy();
  }

  set(key: string, value: any): void {
    this.#session.set(key, value);
  }

  /** `Set-Cookie` header value for the current session. */
  commit(): Promise<string> {
    return this.#session.commit();
  }

  /** `name=value` pair so the proxy can forward the sealed session to the render. */
  toRequestCookie(): Promise<string> {
    return this.#session.toRequestCookie();
  }
}
