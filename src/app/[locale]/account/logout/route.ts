import {normalizeParams} from '~/lib/server/route';

type Segment = {params: Promise<{locale: string}>};

/**
 * `GET /account/logout` (prefixed or not) just goes home, as the React Router
 * route's loader did. Logging out is a POST: Hydrogen's registered handler in
 * `src/proxy.ts` for `/account/logout`, `route-actions/account/logout` for
 * locale-prefixed URLs.
 */
export async function GET(_request: Request, {params}: Segment) {
  const {locale} = normalizeParams(await params);
  return new Response(null, {
    status: 302,
    headers: {
      Location: locale ? `/${locale}` : '/',
      'Cache-Control': 'no-store',
    },
  });
}
