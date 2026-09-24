import 'server-only';

import {cache} from 'react';
import {notFound, permanentRedirect, redirect} from 'next/navigation';

import {
  finalizeRouteResponse,
  getContext,
  getRequest,
  getRouteContext,
} from './context';
import type {AppLoadContext} from './context';

/**
 * Glue between React Router-style `loader`/`action` functions and the App
 * Router, so route modules keep their original data code:
 *
 * ```ts
 * async function loader({context, request, params}: LoaderArgs<{handle: string}>) {...}
 *
 * export async function generateMetadata({params}: PageProps) {
 *   return getSeoMetadata(...(await runLoader(loader, await params)).seo)
 * }
 * export default async function Page({params}: PageProps) {
 *   const data = await runLoader(loader, await params);
 *   return <RouteDataProvider id="products.$handle" data={data}>...</RouteDataProvider>;
 * }
 * ```
 *
 * Returned/thrown `Response`s map to Next primitives: 3xx → `redirect()`
 * (`permanentRedirect()` for 301/308), 404 → `notFound()`, JSON → data.
 * With Cache Components the page response has already committed to 200 by
 * the time a loader runs, so these redirect client-side and 404s render the
 * not-found page with `noindex`. Redirects that need a real HTTP status
 * belong in `src/proxy.ts`.
 */

export type RouteParams = Record<string, string | string[] | undefined>;

export type LoaderArgs<Params extends RouteParams = RouteParams> = {
  context: AppLoadContext;
  request: Request;
  params: Params & {locale?: string};
};

export type ActionArgs<Params extends RouteParams = RouteParams> =
  LoaderArgs<Params>;

type LoaderFunction<Params extends RouteParams, Result> = (
  args: LoaderArgs<Params>,
) => Promise<Result> | Result;

/** Unwrap what a loader resolved to into the data the page renders. */
export type LoaderData<Result> = Exclude<Awaited<Result>, Response>;

/** Internal locale segment the proxy uses for unprefixed URLs. */
const DEFAULT_LOCALE_SEGMENT = 'default';

/** Map App Router params back to React Router's (`$locale` optional, splat as `*`). */
export function normalizeParams<Params extends RouteParams>(
  params: Params | undefined,
): Params & {locale?: string} {
  const normalized: RouteParams = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    const decoded = Array.isArray(value)
      ? value.map((part) => safeDecode(part))
      : typeof value === 'string'
        ? safeDecode(value)
        : value;
    normalized[key] = decoded;
  });
  if (normalized.locale === DEFAULT_LOCALE_SEGMENT)
    normalized.locale = undefined;
  if (Array.isArray(normalized.splat))
    normalized['*'] = normalized.splat.join('/');
  return normalized as Params & {locale?: string};
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

async function responseToData(response: Response): Promise<any> {
  const location = response.headers.get('Location');
  if (location && isRedirectStatus(response.status)) {
    if (response.status === 301 || response.status === 308) {
      permanentRedirect(location);
    }
    redirect(location);
  }
  if (response.status === 404) notFound();
  if (response.status >= 400) {
    throw new Error(
      `Loader responded with ${response.status} ${response.statusText}`,
    );
  }
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) return response.json();
  return null;
}

const runLoaderCached = cache(
  async (loader: LoaderFunction<any, any>, paramsKey: string) => {
    const [context, request] = await Promise.all([getContext(), getRequest()]);
    try {
      const result = await loader({
        context,
        request,
        params: normalizeParams(JSON.parse(paramsKey)),
      });
      return result instanceof Response ? responseToData(result) : result;
    } catch (error) {
      if (error instanceof Response) return responseToData(error);
      throw error;
    }
  },
);

/**
 * Run a loader for the current request. Memoized per request, so
 * `generateMetadata` and the page share one invocation.
 */
export function runLoader<Params extends RouteParams, Result>(
  loader: LoaderFunction<Params, Result>,
  params?: Params | Record<string, never>,
): Promise<LoaderData<Result>> {
  return runLoaderCached(
    loader as LoaderFunction<any, any>,
    JSON.stringify(params || {}),
  );
}

type RouteSegment = {params: Promise<RouteParams>};

/**
 * Wrap a React Router `loader` or `action` as a Next route handler
 * (`export const GET = routeHandler(loader)`). Plain return values become
 * JSON; `Response`s pass through. Sessions are committed and Hydrogen
 * response headers applied.
 */
export function routeHandler<Params extends RouteParams>(
  fn: LoaderFunction<Params, unknown>,
) {
  return async (incomingRequest: Request, segment: RouteSegment) => {
    const {context, request} = await getRouteContext(incomingRequest);
    let result: unknown;
    try {
      result = await fn({
        context,
        request,
        params: normalizeParams((await segment?.params) as Params),
      });
    } catch (error) {
      if (!(error instanceof Response)) throw error;
      result = error;
    }
    const response =
      result instanceof Response ? result : Response.json(result ?? null);
    return finalizeRouteResponse(response, context);
  };
}
