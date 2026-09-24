'use client';

import {CustomerAccountLayout} from '~/components/AccountLayout/CustomerAccountLayout';
import {Order} from '~/components/Account/Order/Order';

export default function OrderRoute() {
  return (
    <CustomerAccountLayout>
      <Order />
    </CustomerAccountLayout>
  );
}
