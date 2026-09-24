import {FROM_ACCOUNT_AUTHORIZATION_KEY} from '~/lib/constants';
import {normalizeParams} from '~/lib/server/route';

type Segment = {params: Promise<{locale: string}>};

/**
 * Locale-prefixed login (`/:locale/account/login`). Hydrogen's registered
 * handler in `src/proxy.ts` owns the unprefixed `/account/login` (OAuth +
 * session cookie); send the customer there with a `return_to` that brings
 * them back to this locale's account home.
 */
export async function GET(request: Request, {params}: Segment) {
  const {locale} = normalizeParams(await params);
  const prefix = locale ? `/${locale}` : '';
  const returnTo =
    new URL(request.url).searchParams.get('return_to') ||
    `${prefix}/account?${FROM_ACCOUNT_AUTHORIZATION_KEY}=1`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/account/login?return_to=${encodeURIComponent(returnTo)}`,
      'Cache-Control': 'no-store',
    },
  });
}
