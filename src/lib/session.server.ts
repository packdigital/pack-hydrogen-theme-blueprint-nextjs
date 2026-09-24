import {CookieSession} from '~/lib/server/cookie-session';

/**
 * App session (`session` cookie). Previously React Router cookie session
 * storage; now an encrypted `CookieSession`. Server components can read it;
 * writes are committed by route handlers (see `finalizeRouteResponse`).
 *
 * Customer Account tokens no longer live here; they use their own cookie
 * (`~/lib/server/customer-account`).
 */
export class AppSession {
  static init(cookieHeader: string | null | undefined, secrets: string[]) {
    return CookieSession.init(cookieHeader, {
      name: 'session',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      secrets,
    });
  }
}

export type HydrogenSession = CookieSession;
