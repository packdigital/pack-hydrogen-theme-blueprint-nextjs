import {Suspense} from 'react';

import {NotFound} from '~/components/Document';
import {redirectToShopifyRedirect} from '~/lib/server/storefront-redirect';

/**
 * 404 page. Shopify URL redirects and `/admin` are resolved in the proxy
 * before rendering (real HTTP redirects). This checks the rest (`?redirect=`
 * params, standard-route redirects) as a client-side fallback, since with
 * Cache Components the response has already committed to 200 here.
 */
export default function NotFoundPage() {
  return (
    <>
      <Suspense fallback={null}>
        <StorefrontRedirect />
      </Suspense>
      <NotFound />
    </>
  );
}

async function StorefrontRedirect() {
  await redirectToShopifyRedirect();
  return null;
}
