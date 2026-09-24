import 'server-only';

import type {Shop} from '@shopify/hydrogen/storefront-api-types';
import type {Customer} from '@shopify/hydrogen/customer-account-api-types';

import {getShopAnalytics, ShopifySalesChannel} from '~/lib/analytics/shop';
import {getCookieDomain} from '~/lib/utils/document.utils';
import {
  getPublicEnvs,
  getShop,
  getSiteSettings,
} from '~/lib/server-utils/settings.server';
import {getProductGroupings} from '~/lib/server-utils/pack.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {getModalProduct} from '~/lib/server-utils/product.server';
import {CUSTOMER_DETAILS_QUERY} from '~/data/graphql/customer-account/customer';
import type {RootSiteSettings} from '~/lib/types';

import type {LoaderArgs} from './route';

/**
 * Root loader (formerly `app/root.tsx`). Runs in the `[locale]` root layout.
 * The buyer-locale redirect it used to do now runs in `src/proxy.ts`, since
 * it sets a cookie.
 */
export async function rootLoader({context, request}: LoaderArgs) {
  const {storefront, oxygen, pack, env, customerAccount, cart} = context;
  const isPreviewModeEnabled = pack.isPreviewModeEnabled() as boolean;

  const [shop, siteSettings, ENV, isLoggedIn]: [
    Shop,
    RootSiteSettings,
    Record<string, string>,
    boolean,
  ] = await Promise.all([
    getShop(context),
    getSiteSettings(context),
    getPublicEnvs({context, request}),
    customerAccount.isLoggedIn(),
  ]);

  const groupingsPromise = getProductGroupings(context);

  let customer: Customer | null = null;

  if (isLoggedIn) {
    // Read-only: an expired access token only affects this optional read,
    // so don't redirect through /account/refresh from the root.
    const accessToken = await customerAccount
      .getAccessToken()
      .catch(() => undefined);
    if (accessToken) {
      const {data, errors} = await customerAccount.query(
        CUSTOMER_DETAILS_QUERY,
      );
      if (data?.customer && !errors?.length) customer = data.customer;
    }
  }

  const cookieDomain = getCookieDomain(request.url);

  /* Get product if modalProduct url param is present */
  const {modalProduct, modalSelectedVariant} = await getModalProduct({
    context,
    request,
  });

  const analytics = {
    shopifySalesChannel: ShopifySalesChannel.hydrogen,
    shopId: shop.id,
  };
  const seo = seoPayload.root({
    shop,
    siteSettings,
    url: request.url,
  }) as Record<string, any>;
  const consent = {
    checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
    storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
    withPrivacyBanner: true,
    country: storefront.i18n.country,
    language: storefront.i18n.language,
  };
  const shopAnalytics = getShopAnalytics({
    storefront,
    publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
  });
  const SITE_TITLE = siteSettings?.data?.siteSettings?.seo?.title || shop.name;

  const requestSearch = new URL(request.url).search;
  const hasPlaybookParams =
    requestSearch.includes('_pv=') ||
    requestSearch.includes('pbk=') ||
    requestSearch.includes('pb_mode=brand_preview') ||
    requestSearch.includes('_preview=true');

  return {
    analytics,
    cart: cart.get(),
    consent,
    cookieDomain,
    customer,
    customizerMeta: pack.session.get('customizerMeta'),
    ENV: {...ENV, SITE_TITLE} as Record<string, string>,
    groupingsPromise,
    hasPlaybookParams,
    isPreviewModeEnabled,
    modalProduct,
    modalSelectedVariant,
    oxygen,
    ...pack.getPackContextData(),
    selectedLocale: storefront.i18n,
    seo,
    shop: shopAnalytics,
    shopifyScripts: {
      shop: {
        shopId: env.SHOP_ID,
        storefrontId: env.PUBLIC_STOREFRONT_ID || '0',
        myshopifyDomain: env.PUBLIC_STORE_DOMAIN,
      },
      i18n: {
        country: storefront.i18n.country,
        language: storefront.i18n.language,
        currency: storefront.i18n.currency,
      },
    },
    siteSettings,
    siteTitle: SITE_TITLE,
    url: request.url,
  };
}

export type RootLoaderData = Awaited<ReturnType<typeof rootLoader>>;
