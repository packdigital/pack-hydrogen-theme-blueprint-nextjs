'use client';

import {CustomerAccountLayout} from '~/components/AccountLayout/CustomerAccountLayout';
import {Profile} from '~/components/Account/Profile';

export default function ProfileRoute() {
  return (
    <CustomerAccountLayout>
      <Profile />
    </CustomerAccountLayout>
  );
}
