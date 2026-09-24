'use client';

import {CustomerAccountLayout} from '~/components/AccountLayout/CustomerAccountLayout';
import {Addresses} from '~/components/Account/Addresses/Addresses';

export default function AddressesRoute() {
  return (
    <CustomerAccountLayout>
      <Addresses />
    </CustomerAccountLayout>
  );
}
