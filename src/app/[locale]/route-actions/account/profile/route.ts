import {customerUpdateProfileAction} from '~/lib/customer/profile.server';
import {routeHandler} from '~/lib/server/route';
import type {ActionArgs} from '~/lib/server/route';

/** Action for `/account/profile` (formerly the route module's `action`). */
async function action({request, context}: ActionArgs) {
  // Double-check current user is logged in
  if (!(await context.customerAccount.isLoggedIn())) {
    return context.customerAccount.logout();
  }
  const {data, status} = await customerUpdateProfileAction({request, context});
  return Response.json(data, {status});
}

export const POST = routeHandler(action);
