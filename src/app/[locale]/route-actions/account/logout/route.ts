import {routeHandler} from '~/lib/server/route';
import type {ActionArgs} from '~/lib/server/route';

/**
 * `POST /:locale/account/logout` (the proxy rewrites non-GET page requests
 * here). Unprefixed `POST /account/logout` is handled by Hydrogen's registered
 * handler in `src/proxy.ts` before reaching the app.
 */
async function action({request, context}: ActionArgs) {
  // Same-origin POST check, as Hydrogen's logout handler enforces
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return new Response('Forbidden', {status: 403});
  }
  const response = await context.customerAccount.logout();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const POST = routeHandler(action);
