/**
 * Locale-prefixed OAuth callback (`/:locale/account/authorize`). Hydrogen's
 * registered handler in `src/proxy.ts` owns `/account/authorize`; forward the
 * callback there with its query (`code`, `state`) intact.
 */
export async function GET(request: Request) {
  const {search} = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/account/authorize${search}`,
      'Cache-Control': 'no-store',
    },
  });
}
