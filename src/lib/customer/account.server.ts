import 'server-only';

import type {Customer} from '@shopify/hydrogen/customer-account-api-types';

import {
  FROM_ACCOUNT_AUTHORIZATION_KEY,
  LOGGED_IN_PROFILE_REDIRECT_TO,
  LOGGED_IN_REDIRECT_TO,
  LOGGED_OUT_REDIRECT_TO,
} from '~/lib/constants';
import {CUSTOMER_DETAILS_QUERY} from '~/data/graphql/customer-account/customer';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

import {ACCOUNT_EVENT_PARAM, ACCOUNT_EVENTS} from './constants';
import type {AccountEvent} from './constants';

/**
 * Loaders for the `($locale).account` layout. They live here instead of the
 * layout/page modules because Next only allows its own exports there.
 */

type Params = {locale?: string};

function redirectTo(location: string) {
  return new Response(null, {status: 302, headers: {Location: location}});
}

/**
 * Account layout loader: sends signed-out customers to login and loads the
 * customer for every account page. Runs once per request (`runLoader`
 * memoizes it), whether called by the layout or a child page.
 */
export async function accountLoader({context, params}: LoaderArgs<Params>) {
  const {locale} = params;
  const isLoggedIn = await context.customerAccount.isLoggedIn();

  if (!isLoggedIn) {
    throw redirectTo(
      locale ? `/${locale}${LOGGED_OUT_REDIRECT_TO}` : LOGGED_OUT_REDIRECT_TO,
    );
  }

  // May throw a redirect to `/account/refresh` when the access token expired
  const {data, errors} = await context.customerAccount.query<{
    customer: Customer;
  }>(CUSTOMER_DETAILS_QUERY);

  // If the customer failed to load, we assume their access token is invalid.
  // Read-only contexts turn `logout()` into a redirect to sign in again.
  if (errors?.length || !data?.customer) {
    throw await context.customerAccount.logout();
  }

  return {customer: data.customer as Customer};
}

export type AccountLoaderData = Awaited<ReturnType<typeof accountLoader>>;

/** Internal locale segment the proxy rewrites unprefixed URLs to. */
const DEFAULT_LOCALE_SEGMENT = 'default';

/**
 * Account layout data for the current request. The layout and child pages
 * share one memoized run, so this accepts raw App Router params as well as
 * normalized loader params (`locale` undefined for unprefixed URLs) and keys
 * both the same way.
 */
export function getAccountData(params: Params) {
  return runLoader(accountLoader, {
    locale: params.locale || DEFAULT_LOCALE_SEGMENT,
  });
}

/**
 * `/account` has no page of its own: redirect to orders (or profile when the
 * name is incomplete). After an authorization, flag the login/registration
 * analytics event with `ACCOUNT_EVENT_PARAM` for the client to publish.
 */
export async function accountHomeLoader(args: LoaderArgs<Params>) {
  const {request, params} = args;
  const {locale} = params;
  const {customer} = await getAccountData(params);

  const searchParams = new URL(request.url).searchParams;
  const isFromAuthorization =
    searchParams.get(FROM_ACCOUNT_AUTHORIZATION_KEY) === '1';

  let event: AccountEvent | undefined;
  if (isFromAuthorization) {
    // Determine if from registration based on if creation date was within last 5 seconds
    const isFromRegistration =
      Date.now() - new Date(customer.creationDate).getTime() < 5000;
    event = isFromRegistration
      ? ACCOUNT_EVENTS.registered
      : ACCOUNT_EVENTS.loggedIn;
  }

  // If customer signs up with incomplete profile, redirect to profile page
  const pathname =
    !customer.firstName || !customer.lastName
      ? LOGGED_IN_PROFILE_REDIRECT_TO
      : LOGGED_IN_REDIRECT_TO;
  const search = event ? `?${ACCOUNT_EVENT_PARAM}=${event}` : '';

  return redirectTo(`${locale ? `/${locale}` : ''}${pathname}${search}`);
}
