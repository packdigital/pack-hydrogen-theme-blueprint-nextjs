/**
 * Server-safe analytics helpers (no `'use client'`): the old
 * `@shopify/hydrogen` `getShopAnalytics` + `ShopifySalesChannel`, plus the
 * `AnalyticsPageType` constants loaders put in their `analytics` payload.
 */
import type {Storefront} from '~/lib/server/storefront';

import type {ShopAnalytics} from './types';

export {AnalyticsPageType} from './events';
export type {ShopAnalytics} from './types';

/** Shopify sales channels (from `@shopify/hydrogen-react`). */
export const ShopifySalesChannel = {
  hydrogen: 'hydrogen',
  headless: 'headless',
} as const;
export type ShopifySalesChannel =
  (typeof ShopifySalesChannel)[keyof typeof ShopifySalesChannel];

const SHOP_QUERY = `#graphql
  query ShopData(
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    shop {
      id
    }
    localization {
      country {
        currency {
          isoCode
        }
      }
      language {
        isoCode
      }
    }
  }
`;

type ShopDataQuery = {
  shop: {id: string};
  localization: {
    country: {currency: {isoCode: ShopAnalytics['currency']}};
    language: {isoCode: ShopAnalytics['acceptedLanguage']};
  };
};

/**
 * Old Hydrogen `getShopAnalytics`: resolves the shop id, currency and
 * language for the current market. Returns a promise (pass it straight to
 * `<Analytics.Provider shop={...}>`; client components can receive it).
 */
export async function getShopAnalytics({
  storefront,
  publicStorefrontId = '0',
}: {
  storefront: Storefront;
  publicStorefrontId?: string;
}): Promise<ShopAnalytics | null> {
  const {shop, localization} = await storefront.query<ShopDataQuery>(
    SHOP_QUERY,
    {
      variables: {
        country: storefront.i18n.country,
        language: storefront.i18n.language,
      },
      cache: storefront.CacheLong(),
    },
  );
  if (!shop?.id) return null;
  return {
    shopId: shop.id,
    acceptedLanguage: localization.language.isoCode,
    currency: localization.country.currency.isoCode,
    hydrogenSubchannelId: publicStorefrontId || '0',
  };
}
