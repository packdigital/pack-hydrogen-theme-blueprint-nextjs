# React Router → Next.js migration notes

This storefront was migrated from Hydrogen on React Router 7 (Oxygen) to
Next.js 16 App Router (Vercel) using the framework-agnostic
`@shopify/hydrogen@2026.10.0-preview` toolkit. This file is the contract for
how the old building blocks map to the new ones.

## Layout

| Old (React Router)                 | New (Next.js)                                                              |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `server.ts` (Oxygen fetch handler) | `src/proxy.ts` + `src/lib/server/context.ts`                               |
| `app/root.tsx` loader              | `src/lib/server/root-loader.ts`, rendered by `src/app/[locale]/layout.tsx` |
| `app/routes/*.tsx` loader/meta     | `src/app/[locale]/**/page.tsx` (server)                                    |
| `app/routes/*.tsx` default export  | `src/routes/*.tsx` (same file name, now `'use client'`, component only)    |
| resource routes (`api.*`, feeds)   | `src/app/**/route.ts` via `routeHandler(loader)`                           |
| route `action`s on page URLs       | `src/app/[locale]/route-actions/**/route.ts` (proxy rewrites non-GET)      |
| `($locale)` optional segment       | `[locale]` segment; proxy rewrites unprefixed URLs to `/default/...`       |
| `$.tsx` splat                      | `[...splat]` (normalized to `params['*']`)                                 |
| `app/` + `~/*` alias               | `src/` + `~/*` alias                                                       |

## Server context

`AppLoadContext` (`~/lib/server/context`) has the same shape as before:
`storefront`, `customerAccount`, `admin`, `cart`, `pack`, `env`, `oxygen`,
`session`, `waitUntil`, plus `requestContext` (Hydrogen request context).

- Server components: `await getContext()`, `await getRequest()` (read-only).
- Route handlers: `routeHandler(fn)` from `~/lib/server/route` builds the
  context, commits sessions and applies Hydrogen response headers.
- Loaders keep their signature: `async function loader({context, request, params}: LoaderArgs<{handle: string}>)`.
  `params.locale` is `undefined` for unprefixed URLs, like before.
- `runLoader(loader, params)` (memoized per request) converts returned/thrown
  `Response`s: 3xx → `redirect()`, 404 → `notFound()`, JSON → data.
- Server components cannot set cookies. Anything that must write a cookie
  runs in the proxy or a route handler.

## Pages

```tsx
// src/app/[locale]/products/[handle]/page.tsx
async function loader({context, params, request}: LoaderArgs<Params>) {
  /* unchanged */
}
export type ProductLoaderData = Awaited<ReturnType<typeof loader>>; // or LoaderData<...>
export const generateMetadata = routeMetadata(loader); // replaces `meta` + getSeoMeta
export default async function Page({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).products.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <ProductRoute /> {/* from ~/routes/($locale).products.$handle */}
    </RouteDataProvider>
  );
}
```

Route components use `useLoaderData()` from `~/lib/router`.
`export const headers = routeHeaders` has no equivalent and is dropped;
Hydrogen sub-requests are cached with `'use cache: remote'` + `cacheLife` +
`cacheTag` (Cache Components; see `~/lib/server/cache`).
`storefrontRedirect()` before a 404 is replaced by `notFound()`. Shopify URL
redirects and `/admin` are resolved in `src/proxy.ts` before rendering, and
`app/[locale]/not-found.tsx` checks the rest client-side.

### Cache Components and HTTP status

`cacheComponents` is enabled, and the `[locale]` layout sets `instant = false`
(pages render on request). The page response commits to `200` before a
page renders, so `redirect()` in a loader is a client-side redirect and
`notFound()` is a `noindex` soft 404. Anything that needs a real 3xx/4xx
status (auth gates, URL redirects) must be decided in `src/proxy.ts`, which
already handles `/admin`, signed-out `/account/*` and Shopify URL redirects.

## Client APIs

Import from `~/lib/router` instead of `react-router`: `useLoaderData`,
`useRouteLoaderData`, `useMatches`, `useLocation`, `useNavigate`,
`useSearchParams`, `useRevalidator`, `useFetcher`, `Link`.

- `useFetcher().submit(formData, {method: 'POST'})` without `action` posts to
  the current URL; the proxy forwards it to that page's `route-actions`
  handler. With `action: '/api/...'` it calls the API route handler.
- Customer Account login/logout must be full document navigations (plain
  `<a href="/account/login">`, `<form method="post" action="/account/logout">`).

## Hydrogen APIs

| Old `@shopify/hydrogen` (React Router)            | New                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `createStorefrontClient` (context)                | `~/lib/server/storefront` over `createStorefrontClient` (new toolkit)                 |
| `createCustomerAccountClient`                     | `~/lib/server/customer-account` over `@shopify/hydrogen/customer-account`             |
| `createCartHandler`                               | `~/lib/server/cart`                                                                   |
| `CacheLong/CacheShort/...`                        | `~/lib/server/cache` (same names, mapped to `cacheLife`)                              |
| `Analytics.*`, `useAnalytics`                     | `~/lib/analytics`                                                                     |
| `getSeoMeta`, `SeoConfig`                         | `~/lib/seo/metadata` (`getSeoMetadata`) + `~/lib/seo/JsonLd`                          |
| `storefrontRedirect`                              | URL redirects in `src/proxy.ts`; `handleShopifyRedirects` fallback in `not-found.tsx` |
| `CartForm.ACTIONS`                                | `CART_ACTIONS` in `~/lib/constants/cart`                                              |
| `flattenConnection`, `parseGid`, `Image`, `Money` | `@shopify/hydrogen-react` (unchanged)                                                 |
| `Script`                                          | plain `<script>`                                                                      |
| `@pack/hydrogen`                                  | `~/lib/pack/server` (server) and `~/lib/pack/client` (client)                         |
