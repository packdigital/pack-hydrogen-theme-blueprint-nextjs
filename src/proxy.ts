import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {handleShopifyRoutes} from '@shopify/hydrogen';
import {createCustomerAccountServerHandlers} from '@shopify/hydrogen/customer-account';

import {
  clearExposedTestCookie,
  commitPackSessions,
  createPackForRequest,
  getForwardedPackCookies,
  handlePacklyticsTrack,
} from '~/lib/pack/server';
import {createMemoryWithCache} from '~/lib/server/cache';
import {
  createReadonlySessionManager,
  createWritableSessionManager,
  getCustomerSession,
  initCustomerCookieSession,
} from '~/lib/server/customer-account';
import {getEnv} from '~/lib/server/env';
import {routeTemplates} from '~/lib/server/route-templates';
import {
  createRequestContext,
  createRequestStorefrontClient,
  createStorefront,
} from '~/lib/server/storefront';
import {
  getLocaleFromRequest,
  redirectLinkToBuyerLocale,
} from '~/lib/server-utils/locale.server';
import {getOxygenEnv} from '~/lib/server-utils/oxygen.server';
import {FROM_ACCOUNT_AUTHORIZATION_KEY} from '~/lib/constants';

/**
 * Request pipeline that `server.ts` + `handleRequest` implemented on Oxygen:
 *
 * 1. Hydrogen-owned routes (`handleShopifyRoutes`): Storefront API proxy,
 *    `/checkout`, cart permalinks, AJAX cart, `/.well-known`, and the
 *    Customer Account `/account/{login,authorize,refresh,logout}` handlers.
 * 2. Packlytics `POST /pack/track` (any locale prefix).
 * 3. Pack sessions + A/B test assignment. These write cookies, which server
 *    components cannot do, so they happen here and are both committed on the
 *    response and forwarded to the render in the `Cookie` header.
 * 4. Redirects that must be real HTTP redirects (`/admin`, signed-out
 *    account pages, Shopify URL redirects) and the one-time redirect to the
 *    buyer's locale (from Vercel geolocation).
 * 5. Rewrites into the App Router tree:
 *    - unprefixed URLs → `/default/...` (the `[locale]` segment)
 *    - `/products/:handle.json`, `/collections/:handle.json` → JSON handlers
 *    - non-GET requests to page URLs → the page's `route-actions` handler
 *      (React Router route `action`s)
 *
 * With Cache Components, page responses commit to 200 before rendering, so
 * redirects/404s decided in a page are client-side (redirect) or streamed
 * `noindex` (404). Anything that needs a real status is decided here.
 */

const DEFAULT_LOCALE_SEGMENT = 'default';
const PACK_TEST_INFO_HEADER = 'x-pack-test-info';

/** Routes served at the root, outside the `[locale]` tree. */
const ROOT_ROUTE_RE =
  /^\/(?:robots\.txt|sitemap\.xml|product-feed\.xml|sitemap\/.+|api\/edit|apps\/playbook(?:\/.*)?)$/;
const JSON_ROUTE_RE = /^\/(products|collections)\/([^/]+)\.json$/;

const customerAccountHandlers = (env: Env) =>
  createCustomerAccountServerHandlers({
    customerSession: getCustomerSession(env),
    defaultPostLoginRedirectPathname: `/account?${FROM_ACCOUNT_AUTHORIZATION_KEY}=1`,
  });

function isDocumentRequest(request: NextRequest) {
  return (
    request.method === 'GET' &&
    !request.headers.has('rsc') &&
    !request.headers.has('next-router-prefetch') &&
    (request.headers.get('accept') || '').includes('text/html')
  );
}

export async function proxy(request: NextRequest) {
  const env = getEnv();
  const {pathname} = request.nextUrl;

  const i18n = getLocaleFromRequest(request);
  const requestContext = createRequestContext(request, i18n);
  const storefrontClient = createRequestStorefrontClient(requestContext, env);

  // 1. Hydrogen-owned routes
  const customerCookieSession = await initCustomerCookieSession(
    request.headers.get('cookie'),
    env,
  );
  const sessionManager = createWritableSessionManager(
    customerCookieSession,
    request.nextUrl.origin,
  );
  const shopifyRoute = handleShopifyRoutes({
    request,
    requestContext,
    sessionManager,
    storefrontClient,
    routeTemplates,
    handlers: [customerAccountHandlers(env)],
  });
  if (shopifyRoute) return shopifyRoute;

  // The preview-mode route commits the Pack session itself; a second
  // `__pack` Set-Cookie from here would race it.
  if (pathname === '/api/edit') {
    return NextResponse.next({
      request: {headers: requestContext.getForwardedRequestHeaders()},
    });
  }

  const withCache = createMemoryWithCache();

  // Redirects that must be real HTTP redirects. With Cache Components the page
  // response commits to 200 before it renders, so a redirect() inside a page
  // would only redirect client-side.
  const preRenderRedirect = await getPreRenderRedirect({
    request,
    env,
    i18n,
    requestContext,
    customerCookieSession,
    withCache,
  });
  if (preRenderRedirect) return preRenderRedirect;

  // 2-3. Pack
  const pack = await createPackForRequest({request, env, withCache, i18n});

  if (pathname.endsWith('/pack/track') && request.method === 'POST') {
    return handlePacklyticsTrack(request, pack);
  }

  const testInfo = await pack.resolveTestInfo().catch((error) => {
    console.error('[Pack Test] Error resolving test info:', error);
    return undefined;
  });

  // 4. Redirect to the buyer's locale once per cookie session
  const oxygen = getOxygenEnv(request);
  if (
    isDocumentRequest(request) &&
    !pack.isPreviewModeEnabled() &&
    oxygen.buyer.country &&
    i18n.country !== oxygen.buyer.country &&
    !ROOT_ROUTE_RE.test(pathname)
  ) {
    const storefront = createStorefront({env, i18n, requestContext, withCache});
    const redirectedLink = await redirectLinkToBuyerLocale({
      context: {storefront, oxygen},
      request,
    }).catch(() => undefined);
    if (redirectedLink) {
      const response = NextResponse.redirect(
        new URL(redirectedLink.to, request.url),
        302,
      );
      Object.entries(redirectedLink.options.headers).forEach(([key, value]) =>
        response.headers.append(key, value),
      );
      await commitPackSessions(pack, response.headers);
      return response;
    }
  }

  // 5. Rewrites
  const forwardedHeaders = requestContext.getForwardedRequestHeaders();
  forwardedHeaders.set(
    'cookie',
    await getForwardedPackCookies(pack, request.headers.get('cookie')),
  );
  forwardedHeaders.set(
    PACK_TEST_INFO_HEADER,
    encodeURIComponent(JSON.stringify(testInfo ?? null)),
  );

  const rewriteUrl = getRewriteUrl(request, i18n.pathPrefix);
  const response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, {request: {headers: forwardedHeaders}})
    : NextResponse.next({request: {headers: forwardedHeaders}});

  clearExposedTestCookie(request, response.headers);
  await commitPackSessions(pack, response.headers);
  requestContext.applyResponseHeaders(response.headers);
  return response;
}

const ACCOUNT_HANDLER_PATH_RE =
  /^\/account\/(?:login|authorize|refresh|logout)$/;
const URL_REDIRECT_QUERY = `#graphql
  query redirects($query: String) {
    urlRedirects(first: 1, query: $query) {
      edges {
        node {
          target
        }
      }
    }
  }
`;

function isNavigationRequest(request: NextRequest) {
  return (
    request.method === 'GET' &&
    (request.headers.has('rsc') ||
      (request.headers.get('accept') || '').includes('text/html'))
  );
}

function redirectTo(request: NextRequest, location: string, status: number) {
  const response = NextResponse.redirect(
    new URL(location, request.url),
    status,
  );
  response.headers.set('cache-control', 'no-store');
  return response;
}

/**
 * Redirects decided before rendering, so they keep real HTTP statuses:
 * - `/admin` → the shop's admin (301)
 * - account pages without a customer session → `/account/login` (307); a
 *   local cookie read, no API call
 * - Shopify Online Store URL redirects (301), looked up per path for page
 *   navigations and cached in memory for 5 minutes (hits and misses)
 * Everything else that 404s after rendering becomes a streamed `noindex` 404.
 */
async function getPreRenderRedirect({
  request,
  env,
  i18n,
  requestContext,
  customerCookieSession,
  withCache,
}: {
  request: NextRequest;
  env: Env;
  i18n: ReturnType<typeof getLocaleFromRequest>;
  requestContext: ReturnType<typeof createRequestContext>;
  customerCookieSession: Awaited<ReturnType<typeof initCustomerCookieSession>>;
  withCache: ReturnType<typeof createMemoryWithCache>;
}) {
  if (!isNavigationRequest(request)) return null;
  const {pathname, search} = request.nextUrl;
  if (ROOT_ROUTE_RE.test(pathname)) return null;

  const path = i18n.pathPrefix
    ? pathname.slice(i18n.pathPrefix.length) || '/'
    : pathname;
  if (path.startsWith('/api/') || JSON_ROUTE_RE.test(path)) return null;

  if (path === '/admin') {
    return redirectTo(request, `https://${env.PUBLIC_STORE_DOMAIN}/admin`, 301);
  }

  if (
    (path === '/account' || path.startsWith('/account/')) &&
    !ACCOUNT_HANDLER_PATH_RE.test(path)
  ) {
    const isLoggedIn = await getCustomerSession(env)
      .isLoggedIn(
        createReadonlySessionManager(customerCookieSession),
        requestContext,
      )
      .catch(() => false);
    if (!isLoggedIn) {
      return redirectTo(request, `${i18n.pathPrefix}/account/login`, 307);
    }
    return null;
  }

  // Prefetches don't need the lookup; the navigation that follows does it.
  if (request.headers.has('next-router-prefetch')) return null;

  const storefront = createStorefront({env, i18n, requestContext, withCache});
  const queryPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const result = await storefront
    .query<{urlRedirects?: {edges: Array<{node: {target: string}}>}}>(
      URL_REDIRECT_QUERY,
      {
        variables: {query: `path:${queryPath}`},
        cache: storefront.CacheCustom({mode: 'public', maxAge: 300}),
      },
    )
    .catch(() => null);
  const target = result?.urlRedirects?.edges?.[0]?.node?.target;
  if (!target) return null;

  const location = new URL(target, request.nextUrl.origin);
  new URLSearchParams(search).forEach((value, key) =>
    location.searchParams.append(key, value),
  );
  return redirectTo(request, location.toString(), 301);
}

function getRewriteUrl(request: NextRequest, pathPrefix: string) {
  const {pathname} = request.nextUrl;
  if (ROOT_ROUTE_RE.test(pathname)) return null;

  const localeSegment = pathPrefix
    ? pathPrefix.slice(1)
    : DEFAULT_LOCALE_SEGMENT;
  const path = pathPrefix ? pathname.slice(pathPrefix.length) || '/' : pathname;

  let target = path;
  const jsonMatch = path.match(JSON_ROUTE_RE);
  if (jsonMatch) {
    target = `/json/${jsonMatch[1]}/${jsonMatch[2]}`;
  } else if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    !request.headers.has('next-action') &&
    !path.startsWith('/api/')
  ) {
    target = `/route-actions${path === '/' ? '' : path}`;
  }

  if (pathPrefix && target === path) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/${localeSegment}${target === '/' ? '' : target}`;
  return url;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static files in /public. Hydrogen
     * paths such as /api/2026-04/graphql.json, /cart.js and /.well-known/*
     * must still reach the proxy.
     */
    '/((?!_next/static|_next/image|favicon\\.svg|svgs/|fonts/|.*\\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|css|map)$).*)',
  ],
};
