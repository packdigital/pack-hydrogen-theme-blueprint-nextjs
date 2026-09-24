'use client';

import {useCallback} from 'react';
import {useRouter} from 'next/navigation';
import {ShopifyScripts as HydrogenShopifyScripts} from '@shopify/hydrogen/react';
import type {ShopifyScriptsProps as HydrogenShopifyScriptsProps} from '@shopify/hydrogen/react';
import type {
  ConsentConfig,
  ShopifyScriptsI18n,
  ShopifyScriptsShop,
} from '@shopify/hydrogen';

export type {ConsentConfig, ShopifyScriptsI18n, ShopifyScriptsShop};

export type ShopifyScriptsProps = Omit<
  HydrogenShopifyScriptsProps,
  'navigate' | 'consent' | 'i18n'
> & {
  /** Defaults to `{mode: 'default-banner'}` (old `withPrivacyBanner: true`). */
  consent?: ConsentConfig;
  /**
   * Resolved market. Accepts Storefront API `CountryCode` / `LanguageCode`
   * strings (Hydrogen narrows these to the codes it knows about).
   */
  i18n?: {
    country: string;
    language: string;
    currency?: string;
    pathPrefix?: string;
  };
};

const DEFAULT_CONSENT: ConsentConfig = {mode: 'default-banner'};

/**
 * Renders Hydrogen's `<ShopifyScripts>` (Shopify global bootstrap, analytics
 * bus, Customer Privacy / privacy banner, Shopify analytics, PerfKit) once in
 * the root layout, wiring `Shopify.routes.navigate` to the Next router.
 *
 * All props are serializable so a server layout can render it:
 * `<ShopifyScripts shop={{shopId, storefrontId, myshopifyDomain}}
 *   i18n={{country, language, currency}} routes={routeTemplates} />`
 */
export function ShopifyScripts({
  consent = DEFAULT_CONSENT,
  i18n,
  ...props
}: ShopifyScriptsProps) {
  const router = useRouter();
  const navigate = useCallback(
    (url: string) => {
      router.push(url);
    },
    [router],
  );

  return (
    <HydrogenShopifyScripts
      {...props}
      i18n={i18n as ShopifyScriptsI18n | undefined}
      consent={consent}
      navigate={navigate}
    />
  );
}
