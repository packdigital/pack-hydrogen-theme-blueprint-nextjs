/**
 * Analytics constants that the storefront used to import from the old
 * `@shopify/hydrogen` (2026.4) / `@shopify/hydrogen-react` packages.
 *
 * Server-safe: no `'use client'`, no browser globals.
 */

/** Standard Hydrogen analytics event names plus the `custom_` prefix. */
export const AnalyticsEvent = {
  // Views
  PAGE_VIEWED: 'page_viewed',
  PRODUCT_VIEWED: 'product_viewed',
  COLLECTION_VIEWED: 'collection_viewed',
  CART_VIEWED: 'cart_viewed',
  SEARCH_VIEWED: 'search_viewed',
  // Cart
  CART_UPDATED: 'cart_updated',
  PRODUCT_ADD_TO_CART: 'product_added_to_cart',
  PRODUCT_REMOVED_FROM_CART: 'product_removed_from_cart',
  // Custom
  CUSTOM_EVENT: 'custom_',
} as {
  PAGE_VIEWED: 'page_viewed';
  PRODUCT_VIEWED: 'product_viewed';
  COLLECTION_VIEWED: 'collection_viewed';
  CART_VIEWED: 'cart_viewed';
  SEARCH_VIEWED: 'search_viewed';
  CART_UPDATED: 'cart_updated';
  PRODUCT_ADD_TO_CART: 'product_added_to_cart';
  PRODUCT_REMOVED_FROM_CART: 'product_removed_from_cart';
  CUSTOM_EVENT: `custom_${string}`;
};

/** The 8 standard events the new Hydrogen analytics bus accepts. */
export type StandardAnalyticsEventName = Exclude<
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent],
  `custom_${string}`
>;

/** Any event the local bus accepts (standard + app `custom_*` events). */
export type AnalyticsEventType =
  StandardAnalyticsEventName | `custom_${string}`;

export const STANDARD_ANALYTICS_EVENTS: ReadonlySet<string> = new Set<string>([
  AnalyticsEvent.PAGE_VIEWED,
  AnalyticsEvent.PRODUCT_VIEWED,
  AnalyticsEvent.COLLECTION_VIEWED,
  AnalyticsEvent.CART_VIEWED,
  AnalyticsEvent.SEARCH_VIEWED,
  AnalyticsEvent.CART_UPDATED,
  AnalyticsEvent.PRODUCT_ADD_TO_CART,
  AnalyticsEvent.PRODUCT_REMOVED_FROM_CART,
]);

export function isStandardAnalyticsEvent(
  event: string,
): event is StandardAnalyticsEventName {
  return STANDARD_ANALYTICS_EVENTS.has(event);
}

/** Legacy Shopify (monorail) event names, from `@shopify/hydrogen-react`. */
export const AnalyticsEventName = {
  PAGE_VIEW: 'PAGE_VIEW',
  ADD_TO_CART: 'ADD_TO_CART',
  PAGE_VIEW_2: 'PAGE_VIEW_2',
  COLLECTION_VIEW: 'COLLECTION_VIEW',
  PRODUCT_VIEW: 'PRODUCT_VIEW',
  SEARCH_VIEW: 'SEARCH_VIEW',
} as const;
export type AnalyticsEventName =
  (typeof AnalyticsEventName)[keyof typeof AnalyticsEventName];

/** Shopify analytics page types, from `@shopify/hydrogen-react`. */
export const AnalyticsPageType = {
  article: 'article',
  blog: 'blog',
  captcha: 'captcha',
  cart: 'cart',
  collection: 'collection',
  customersAccount: 'customers/account',
  customersActivateAccount: 'customers/activate_account',
  customersAddresses: 'customers/addresses',
  customersLogin: 'customers/login',
  customersOrder: 'customers/order',
  customersRegister: 'customers/register',
  customersResetPassword: 'customers/reset_password',
  giftCard: 'gift_card',
  home: 'index',
  listCollections: 'list-collections',
  forbidden: '403',
  notFound: '404',
  page: 'page',
  password: 'password',
  product: 'product',
  policy: 'policy',
  search: 'search',
} as const;
export type AnalyticsPageType =
  (typeof AnalyticsPageType)[keyof typeof AnalyticsPageType];
