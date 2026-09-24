'use client';

import {CustomerAccountLayout} from '~/components/AccountLayout/CustomerAccountLayout';
import {Orders} from '~/components/Account/Orders/Orders';

export default function OrdersRoute() {
  return (
    <CustomerAccountLayout>
      <Orders />
    </CustomerAccountLayout>
  );
}
