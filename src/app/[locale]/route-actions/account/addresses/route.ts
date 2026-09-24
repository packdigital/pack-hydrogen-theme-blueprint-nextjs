import {customerAddressesAction} from '~/lib/customer/addresses.server';
import {routeHandler} from '~/lib/server/route';
import type {ActionArgs} from '~/lib/server/route';

/** Action for `/account/addresses` (formerly the route module's `action`). */
async function action({request, context}: ActionArgs) {
  // Double-check current user is logged in
  if (!(await context.customerAccount.isLoggedIn())) {
    return context.customerAccount.logout();
  }
  const {data, status} = await customerAddressesAction({request, context});
  return Response.json(data, {status});
}

export const POST = routeHandler(action);
