import type {ShopifyRequestContext} from '@shopify/hydrogen';
import * as CAAPI from '@shopify/hydrogen/customer-account';
import type {
  ReadonlyCustomerSessionManager,
  WritableCustomerSessionManager,
} from '@shopify/hydrogen/customer-account';

import {LOGGED_OUT_REDIRECT_TO} from '~/lib/constants';

import {CookieSession} from './cookie-session';

/**
 * Customer Account API wiring on `@shopify/hydrogen/customer-account`.
 *
 * - `customerSession` owns OAuth and token refresh. Its login / authorize /
 *   refresh / logout handlers are registered in `src/proxy.ts`.
 * - Tokens live in an encrypted, HttpOnly cookie (`CookieSession`).
 * - Server components only get a read-only session manager. Code paths that
 *   can commit cookies (proxy, route handlers) use the writable one.
 *
 * `createCustomerAccount()` returns the same surface the React Router app
 * used (`isLoggedIn`, `query`, `mutate`, `logout`, `handleAuthStatus`), so
 * loaders and actions port unchanged.
 */

export const CUSTOMER_SESSION_COOKIE = 'customer_session';
/** Set on the `/account/refresh` round trip so a failed refresh cannot loop. */
export const REFRESHED_PARAM = '_refreshed';

let customerSessionSingleton: ReturnType<
  typeof CAAPI.createCustomerSession
> | null = null;

export function getCustomerSession(env: Env) {
  if (!customerSessionSingleton) {
    customerSessionSingleton = CAAPI.createCustomerSession({
      shopId: env.SHOP_ID,
      customerAccountApiClientId: env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID,
      customerAccountApiUrl: env.PUBLIC_CUSTOMER_ACCOUNT_API_URL || undefined,
    });
  }
  return customerSessionSingleton;
}

export function initCustomerCookieSession(
  cookieHeader: string | null | undefined,
  env: Env,
) {
  return CookieSession.init(cookieHeader, {
    name: CUSTOMER_SESSION_COOKIE,
    secrets: [env.SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function createReadonlySessionManager(
  session: CookieSession,
): ReadonlyCustomerSessionManager {
  return {getSessionItem: (key) => session.get(key)};
}

export function createWritableSessionManager(
  session: CookieSession,
  origin: string,
): WritableCustomerSessionManager {
  return {
    getSessionOrigin: () => origin,
    getSessionItem: (key) => session.get(key),
    setSessionItem: (key, value) => session.set(key, value),
    removeSessionItem: (key) => session.unset(key),
    commit: async () =>
      session.isPending ? {'Set-Cookie': await session.commit()} : undefined,
  };
}

type Errors = Array<{message: string; [key: string]: unknown}> | undefined;
type Result<T> = {data: T | null; errors?: Errors};

export type CustomerAccount = {
  isLoggedIn: () => Promise<boolean>;
  /** A currently usable access token (never refreshes in read-only contexts). */
  getAccessToken: () => Promise<string | undefined>;
  query: <T = any>(
    query: string,
    options?: {variables?: Record<string, any>},
  ) => Promise<Result<T>>;
  mutate: <T = any>(
    mutation: string,
    options?: {variables?: Record<string, any>},
  ) => Promise<Result<T>>;
  /**
   * Redirect `Response` that signs the customer out. In read-only contexts this
   * sends the customer to sign in again; route handlers perform a real logout.
   */
  logout: (options?: {postLogoutRedirectUri?: string}) => Promise<Response>;
  /** Throws a login redirect when the customer is not logged in. */
  handleAuthStatus: () => Promise<void>;
};

function redirectResponse(location: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Location', location);
  return new Response(null, {status: 302, headers: responseHeaders});
}

export function createCustomerAccount({
  env,
  requestContext,
  session,
  url,
  writable,
}: {
  env: Env;
  requestContext: ShopifyRequestContext;
  session: CookieSession;
  /** Current request URL, used for refresh `return_to` and origin. */
  url: URL;
  /** True inside route handlers, which can commit the session cookie. */
  writable: boolean;
}): CustomerAccount {
  const customerSession = getCustomerSession(env);
  const readonlyManager = createReadonlySessionManager(session);
  const writableManager = createWritableSessionManager(session, url.origin);
  const client = CAAPI.createCustomerAccountClient({
    shopId: env.SHOP_ID,
    requestContext,
  });

  const getAccessToken = async () => {
    if (writable) {
      return customerSession.getOrRefreshAccessToken(
        writableManager,
        requestContext,
      );
    }
    const token = await customerSession.getAccessToken(
      readonlyManager,
      requestContext,
    );
    if (token) return token;

    // Logged in with an expired access token: send the customer through the
    // registered refresh handler once, which commits fresh cookies and returns.
    const isLoggedIn = await customerSession.isLoggedIn(
      readonlyManager,
      requestContext,
    );
    if (isLoggedIn && !url.searchParams.has(REFRESHED_PARAM)) {
      const returnTo = new URL(url);
      returnTo.searchParams.set(REFRESHED_PARAM, '1');
      throw redirectResponse(
        `/account/refresh?return_to=${encodeURIComponent(
          `${returnTo.pathname}${returnTo.search}`,
        )}`,
      );
    }
    return undefined;
  };

  const request = async <T>(
    document: string,
    variables?: Record<string, any>,
  ): Promise<Result<T>> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return {data: null, errors: [{message: 'Customer is not logged in'}]};
    }
    const {data, errors} = await (client.graphql as any)(CAAPI.gql(document), {
      accessToken,
      variables,
    });
    return {data: data as T | null, errors: errors as Errors};
  };

  return {
    isLoggedIn: () =>
      customerSession.isLoggedIn(readonlyManager, requestContext),
    getAccessToken,
    query: (query, options) => request(query, options?.variables),
    mutate: (mutation, options) => request(mutation, options?.variables),
    async logout(options) {
      if (!writable) return redirectResponse(LOGGED_OUT_REDIRECT_TO);
      const location = await customerSession.logout(
        writableManager,
        requestContext,
        {postLogoutRedirectUri: options?.postLogoutRedirectUri},
      );
      return redirectResponse(location, {
        'Set-Cookie': await session.commit(),
      });
    },
    async handleAuthStatus() {
      if (
        !(await customerSession.isLoggedIn(readonlyManager, requestContext))
      ) {
        throw redirectResponse(
          `/account/login?return_to=${encodeURIComponent(url.pathname)}`,
        );
      }
    },
  };
}
