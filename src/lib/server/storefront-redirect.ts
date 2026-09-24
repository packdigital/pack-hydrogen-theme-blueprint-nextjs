import 'server-only';

import {permanentRedirect, redirect} from 'next/navigation';
import {handleShopifyRedirects} from '@shopify/hydrogen';

import {getContext, getRequest} from './context';
import {routeTemplates} from './route-templates';

/**
 * Before a 404, redirect if Shopify has a redirect for this URL: Online Store
 * URL redirects, `/admin`, standard-route redirects and `?redirect=` params
 * (what `storefrontRedirect` did in the React Router app).
 *
 * Used by `not-found.tsx` as a client-side fallback; real HTTP redirects for
 * `/admin` and URL redirects happen in the proxy.
 */
export async function redirectToShopifyRedirect() {
  const [request, context] = await Promise.all([getRequest(), getContext()]);
  const result = await handleShopifyRedirects({
    request,
    routeTemplates,
    storefrontClient: context.storefront.client,
  }).catch((error) => {
    console.error('handleShopifyRedirects:error', error);
    return null;
  });
  const location = result?.headers.get('location');
  if (!location) return;
  if (result?.status === 301 || result?.status === 308) {
    permanentRedirect(location);
  }
  redirect(location);
}
