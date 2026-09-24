'use client';

import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';

import {AnalyticsEvent} from '~/components/Analytics/constants';
import {useAnalytics} from '~/lib/analytics';
import {ACCOUNT_EVENT_PARAM, ACCOUNT_EVENTS} from '~/lib/customer/constants';
import type {AccountLoaderData} from '~/lib/customer/account.server';
import {useLoaderData, useSearchParams} from '~/lib/router';

export default function AccountsRoute({children}: {children: ReactNode}) {
  const {customer} = useLoaderData<AccountLoaderData>();
  const {publish} = useAnalytics();
  const [searchParams] = useSearchParams();
  const accountEvent = searchParams.get(ACCOUNT_EVENT_PARAM);
  const publishedEventRef = useRef<string | null>(null);

  // After login or registration, the account home redirect flags the event in
  // the URL; fire the analytics event once and strip the param
  useEffect(() => {
    if (!customer || !accountEvent) return;
    if (publishedEventRef.current === accountEvent) return;
    publishedEventRef.current = accountEvent;

    if (accountEvent === ACCOUNT_EVENTS.registered) {
      publish(AnalyticsEvent.CUSTOMER_REGISTERED, {customer});
    } else if (accountEvent === ACCOUNT_EVENTS.loggedIn) {
      publish(AnalyticsEvent.CUSTOMER_LOGGED_IN, {customer});
    }

    // Native history updates sync with the Next router without a refetch
    const url = new URL(window.location.href);
    url.searchParams.delete(ACCOUNT_EVENT_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [accountEvent, customer, publish]);

  return <>{children}</>;
}
