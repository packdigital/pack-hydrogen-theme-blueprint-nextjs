import type {ReactNode} from 'react';

import {getAccountData} from '~/lib/customer/account.server';
import {ACCOUNT_ROUTE_ID} from '~/lib/customer/constants';
import {RouteDataProvider} from '~/lib/router';
import AccountsRoute from '~/routes/($locale).account';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string};

/**
 * Account layout (formerly `routes/($locale).account.tsx`): gates every
 * account page behind login and provides the customer to child routes.
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<Params>;
}) {
  const data = await getAccountData(await params);
  return (
    <RouteDataProvider id={ACCOUNT_ROUTE_ID} data={data}>
      <AccountsRoute>{children}</AccountsRoute>
    </RouteDataProvider>
  );
}
