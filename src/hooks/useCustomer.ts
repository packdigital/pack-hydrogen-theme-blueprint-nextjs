import type {Customer} from '@shopify/hydrogen/customer-account-api-types';

import {ACCOUNT_ROUTE_ID} from '~/lib/customer/constants';
import {useRouteLoaderData} from '~/lib/router';

import type {RootLoaderData} from './useRootLoaderData';

/**
 * Get the customer object
 * @returns customer
 * @example
 * ```js
 * const customer = useCustomer();
 * ```
 */

export function useCustomer(): Customer | null | undefined {
  const root = useRouteLoaderData<RootLoaderData>('root');
  const account = useRouteLoaderData<{customer: Customer}>(ACCOUNT_ROUTE_ID);

  return account?.customer || root?.customer || null;
}
