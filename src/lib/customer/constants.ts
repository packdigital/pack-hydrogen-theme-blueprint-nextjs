/**
 * Search param the account home redirect adds after a Customer Account
 * authorization, so the client can publish the login / registration analytics
 * event once and strip it from the URL.
 *
 * Replaces the short-lived `LOGGED_IN_COOKIE` / `REGISTERED_COOKIE` cookies the
 * React Router loader set: server components cannot write cookies.
 */
export const ACCOUNT_EVENT_PARAM = '_account_event' as const;

export const ACCOUNT_EVENTS = {
  loggedIn: 'logged_in',
  registered: 'registered',
} as const;

export type AccountEvent = (typeof ACCOUNT_EVENTS)[keyof typeof ACCOUNT_EVENTS];

/** Route id of the account layout for `useRouteLoaderData`. */
export const ACCOUNT_ROUTE_ID = 'routes/($locale).account' as const;
