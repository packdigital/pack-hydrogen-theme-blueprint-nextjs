/**
 * Cookie names and lifetimes shared by the Pack server sessions and the
 * client-side consent hook. Safe to import from client components.
 */
export const PACK_COOKIE_ID = '__pack';
export const PACK_USER_CONSENT_COOKIE_ID = '__pack_user_consent';
export const PACK_TEST_COOKIE_ID = '__pack_test';
export const PACK_COOKIE_MAX_AGE = 60 * 60 * 24 * 360; // 1 year

/** Client-set cookie recording which test the visitor was exposed to. */
export const PACK_EXPOSED_TEST_COOKIE_ID = 'exposedTest';

/**
 * Request header the proxy uses to hand the A/B test it resolved (and wrote to
 * the `__pack_test` cookie) to the render, which cannot write cookies itself.
 */
export const PACK_TEST_INFO_HEADER = 'x-pack-test-info';

export const PACK_POWERED_BY = 'Shopify, Hydrogen + Pack Digital';
