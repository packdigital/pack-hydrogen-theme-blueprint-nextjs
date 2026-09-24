'use client';

import {CartPage} from '~/components/Cart';

/**
 * The React Router `<Outlet />` for the nested `cart.$lines` route is gone:
 * `/cart/:lines` is now a route handler (`app/[locale]/cart/[lines]/route.ts`)
 * that only redirects.
 */
export default function CartRoute() {
  return <CartPage />;
}
