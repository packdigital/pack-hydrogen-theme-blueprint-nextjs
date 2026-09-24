import 'server-only';

import {cache} from 'react';
import {headers} from 'next/headers';
import {after} from 'next/server';
import type {ShopifyRequestContext} from '@shopify/hydrogen';

import {createAdminClient} from '~/lib/admin-api';
import type {Admin} from '~/lib/admin-api';
import {createPackForRequest} from '~/lib/pack/server';
import type {Pack, TestInfo} from '~/lib/pack/server';
import {AppSession} from '~/lib/session.server';
import type {HydrogenSession} from '~/lib/session.server';
import {getLocaleFromRequest} from '~/lib/server-utils/locale.server';
import {getOxygenEnv} from '~/lib/server-utils/oxygen.server';
import type {OxygenEnv} from '~/lib/server-utils/oxygen.server';
import {getCookieDomain} from '~/lib/utils/document.utils';

import {createMemoryWithCache} from './cache';
import {createCartHandler} from './cart';
import type {HydrogenCart} from './cart';
import type {CookieSession} from './cookie-session';
import {
  createCustomerAccount,
  initCustomerCookieSession,
} from './customer-account';
import type {CustomerAccount} from './customer-account';
import {getEnv} from './env';
import {createRequestContext, createStorefront} from './storefront';
import type {Storefront} from './storefront';

/**
 * The per-request server context — the Next.js replacement for the
 * `getLoadContext()` object `server.ts` built for every Oxygen request.
 *
 * - Server components: `await getContext()` (memoized per request with
 *   React `cache`). Read-only: cookies cannot be written while rendering.
 * - Route handlers: `await getRouteContext(request)`, then
 *   `finalizeRouteResponse(response, context)` to commit sessions and apply
 *   Hydrogen's response headers.
 *
 * The shape matches the old `AppLoadContext`, so loaders and server utils
 * port without changes.
 */
export type AppLoadContext = {
  storefront: Storefront;
  customerAccount: CustomerAccount;
  admin: Admin | undefined;
  cart: HydrogenCart;
  env: Env;
  oxygen: OxygenEnv;
  pack: Pack;
  session: HydrogenSession;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Hydrogen request context shared by the Storefront and Customer Account clients */
  requestContext: ShopifyRequestContext;
  customerSession: CookieSession;
};

/** Header the proxy uses to hand the resolved Pack A/B test to the render. */
export const PACK_TEST_INFO_HEADER = 'x-pack-test-info';
/** Header Hydrogen's request context uses to forward the original URL. */
export const STOREFRONT_URL_HEADER = 'x-storefront-url';

let warnedMissingAdminToken = false;

/**
 * Original request URL. The proxy forwards it (`x-storefront-url`) because
 * server components never see the incoming `Request`, and route handlers see
 * the rewritten `/default/...` URL.
 */
export function getRequestUrl(requestHeaders: Headers, fallbackUrl?: string) {
  const forwarded = requestHeaders.get(STOREFRONT_URL_HEADER);
  let url: URL;
  try {
    url = new URL(forwarded || fallbackUrl || '');
  } catch {
    const host = requestHeaders.get('host') || 'localhost';
    const protocol = requestHeaders.get('x-forwarded-proto') || 'https';
    url = new URL(`${protocol}://${host}/`);
  }
  url.searchParams.delete('_rsc');
  return url.toString();
}

function parseTestInfo(value: string | null): TestInfo | null | undefined {
  if (value === null) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value)) as TestInfo | null;
  } catch {
    return undefined;
  }
}

async function createAppContext(
  request: Request,
  {writable}: {writable: boolean},
): Promise<AppLoadContext> {
  const env = getEnv();

  if (!env.SESSION_SECRET) {
    throw new Error('`SESSION_SECRET` environment variable is not set.');
  }
  if (!env.PACK_SECRET_TOKEN) {
    throw new Error('`PACK_SECRET_TOKEN` environment variable is not set.');
  }

  const url = new URL(request.url);
  const i18n = getLocaleFromRequest(request);
  const requestContext = createRequestContext(request, i18n);
  // Only Pack's A/B test rules use this; Storefront, Admin and Pack content
  // queries are cached with 'use cache: remote'.
  const withCache = createMemoryWithCache();
  const cookieHeader = request.headers.get('cookie');

  const [session, customerSession, pack] = await Promise.all([
    AppSession.init(cookieHeader, [env.SESSION_SECRET]),
    initCustomerCookieSession(cookieHeader, env),
    createPackForRequest({
      request,
      env,
      withCache,
      i18n,
      resolvedTestInfo: parseTestInfo(
        request.headers.get(PACK_TEST_INFO_HEADER),
      ),
    }),
  ]);

  const storefront = createStorefront({env, i18n, requestContext});

  const customerAccount = createCustomerAccount({
    env,
    requestContext,
    session: customerSession,
    url,
    writable,
  });

  let admin: Admin | undefined;
  if (env.PRIVATE_ADMIN_API_TOKEN) {
    admin = createAdminClient({
      privateAdminToken: env.PRIVATE_ADMIN_API_TOKEN,
      storeDomain: env.PUBLIC_STORE_DOMAIN,
      i18n,
    }).admin;
  } else if (!warnedMissingAdminToken) {
    warnedMissingAdminToken = true;
    console.warn(
      '`PRIVATE_ADMIN_API_TOKEN` environment variable is not set. Admin API features will be disabled, including previewing draft products while in the customizer.',
    );
  }

  const cart = createCartHandler({
    storefront,
    customerAccount,
    request,
    cookieDomain: getCookieDomain(request.url),
  });

  return {
    storefront,
    customerAccount,
    admin,
    cart,
    env,
    oxygen: getOxygenEnv(request),
    pack,
    session,
    waitUntil: (promise) => after(() => promise),
    requestContext,
    customerSession,
  };
}

/** The incoming request, reconstructed for server components. */
export const getRequest = cache(async () => {
  const requestHeaders = new Headers(await headers());
  return new Request(getRequestUrl(requestHeaders), {headers: requestHeaders});
});

/** Read-only per-request context for server components, layouts and metadata. */
export const getContext = cache(async () => {
  return createAppContext(await getRequest(), {writable: false});
});

/** Writable context for route handlers. */
export async function getRouteContext(request: Request) {
  const url = getRequestUrl(request.headers, request.url);
  const normalizedRequest =
    url === request.url
      ? request
      : new Request(url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: request.signal,
          // @ts-expect-error `duplex` is required by Node when streaming a body
          duplex: 'half',
        });
  return {
    context: await createAppContext(normalizedRequest, {writable: true}),
    request: normalizedRequest,
  };
}

/**
 * Commit session cookies and apply Hydrogen's request-context headers
 * (Shopify tracking cookies, Server-Timing, private cache-control for
 * personalized responses) to a route handler response.
 */
export async function finalizeRouteResponse(
  response: Response,
  context: AppLoadContext,
) {
  let finalResponse = response;
  try {
    finalResponse.headers.set('x-hydrogen-headers-check', '1');
    finalResponse.headers.delete('x-hydrogen-headers-check');
  } catch {
    // Immutable headers (e.g. `Response.redirect`) — copy the response
    finalResponse = new Response(response.body, response);
  }

  if (context.customerSession.isPending) {
    finalResponse.headers.append(
      'Set-Cookie',
      await context.customerSession.commit(),
    );
  }
  if (context.session.isPending) {
    finalResponse.headers.append('Set-Cookie', await context.session.commit());
  }
  context.requestContext.applyResponseHeaders(finalResponse.headers);
  return finalResponse;
}
