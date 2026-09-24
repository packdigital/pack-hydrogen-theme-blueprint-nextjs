/**
 * Types for the local analytics compatibility layer. They mirror the old
 * `@shopify/hydrogen` (2026.4) analytics types the storefront was written
 * against. Server-safe (types only).
 */
import type {ReactNode} from 'react';
import type {
  Cart,
  CartLine,
  ComponentizableCartLine,
  CountryCode,
  CurrencyCode,
  LanguageCode,
  Product,
  ProductVariant,
} from '@shopify/hydrogen/storefront-api-types';

import type {AnalyticsEventType, StandardAnalyticsEventName} from './events';

export type StorefrontApiErrors =
  | Array<{
      message: string;
      path?: ReadonlyArray<string | number>;
      extensions?: unknown;
    }>
  | undefined;

/** A cart as returned from the Storefront API (old Hydrogen `CartReturn`). */
export type CartReturn<TCart = Cart> = TCart & {
  errors?: StorefrontApiErrors;
};

/** Shop data used in analytics payloads (old Hydrogen `ShopAnalytics`). */
export type ShopAnalytics = {
  /** The shop ID (`gid://shopify/Shop/<id>`). */
  shopId: string;
  /** The language code that is being displayed to user. */
  acceptedLanguage: LanguageCode;
  /** The currency code that is being displayed to user. */
  currency: CurrencyCode;
  /** The `PUBLIC_STOREFRONT_ID` (Hydrogen sales channel storefront id). */
  hydrogenSubchannelId: string | '0';
};

/** Legacy product shape (from `@shopify/hydrogen-react`). */
export type ShopifyAnalyticsProduct = {
  productGid: Product['id'];
  variantGid?: ProductVariant['id'];
  name: Product['title'];
  variantName?: ProductVariant['title'];
  brand: Product['vendor'];
  category?: Product['productType'];
  price: ProductVariant['price']['amount'];
  sku?: ProductVariant['sku'];
  quantity?: number;
};

/**
 * Consent config. Keeps the old Hydrogen `consent` prop shape; the new
 * `ShopifyScripts` owns the Customer Privacy API, so only `withPrivacyBanner`
 * (or `mode`) is read here to decide when privacy is "ready".
 */
export type Consent = {
  checkoutDomain?: string;
  storefrontAccessToken?: string;
  withPrivacyBanner?: boolean;
  sameDomainForStorefrontApi?: boolean;
  country?: CountryCode;
  language?: LanguageCode;
  /** New Hydrogen consent mode; `'default-banner'` ≙ `withPrivacyBanner`. */
  mode?: 'default-banner' | 'custom-banner' | 'no-banner';
};

export type OtherData = {
  [key: string]: unknown;
};

export type BasePayload = {
  shop: ShopAnalytics | null;
  customData?: Record<string, unknown>;
};

export type UrlPayload = {
  url: string;
};

export type ProductPayload = {
  id: Product['id'];
  title: Product['title'];
  price: ProductVariant['price']['amount'];
  vendor: Product['vendor'];
  variantId: ProductVariant['id'];
  variantTitle: ProductVariant['title'];
  quantity: number;
  sku?: ProductVariant['sku'];
  productType?: Product['productType'];
};

export type ProductsPayload = {
  products: Array<ProductPayload & OtherData>;
};

export type CollectionPayloadDetails = {
  id: string;
  handle: string;
};

export type CollectionPayload = {
  collection: CollectionPayloadDetails;
};

export type SearchPayload = {
  searchTerm: string;
  searchResults?: any;
};

export type CartPayload = {
  cart: CartReturn | null;
  prevCart: CartReturn | null;
};

export type CartLinePayload = {
  prevLine?: CartLine | ComponentizableCartLine;
  currentLine?: CartLine | ComponentizableCartLine;
};

export type CollectionViewPayload = CollectionPayload &
  UrlPayload &
  BasePayload;
export type ProductViewPayload = ProductsPayload & UrlPayload & BasePayload;
export type CartViewPayload = CartPayload & UrlPayload & BasePayload;
export type PageViewPayload = UrlPayload & BasePayload;
export type SearchViewPayload = SearchPayload & UrlPayload & BasePayload;
export type CartUpdatePayload = CartPayload & BasePayload & OtherData;
export type CartLineUpdatePayload = CartLinePayload &
  CartPayload &
  BasePayload &
  OtherData;
export type CustomEventPayload = BasePayload & OtherData;

export type AnalyticsPayloadMap = {
  page_viewed: PageViewPayload;
  product_viewed: ProductViewPayload;
  collection_viewed: CollectionViewPayload;
  cart_viewed: CartViewPayload;
  search_viewed: SearchViewPayload;
  cart_updated: CartUpdatePayload;
  product_added_to_cart: CartLineUpdatePayload;
  product_removed_from_cart: CartLineUpdatePayload;
};

export type AnalyticsPayloadFor<E extends AnalyticsEventType> =
  E extends StandardAnalyticsEventName
    ? AnalyticsPayloadMap[E]
    : CustomEventPayload;

/**
 * Publish is intentionally loose on payloads (the app publishes partial
 * payloads for custom events, e.g. `{listIndex, product, searchTerm, shop}`).
 */
export type AnalyticsPublish = (
  event: AnalyticsEventType,
  payload?: Record<string, any>,
) => void;

export type AnalyticsSubscribe = (
  event: AnalyticsEventType,
  callback: (payload: any) => void,
) => () => void;

export type AnalyticsRegister = (key: string) => {ready: () => void};

/** Minimal shape of `window.Shopify.customerPrivacy` once loaded. */
export type CustomerPrivacy = {
  currentVisitorConsent: () => Record<string, unknown>;
  preferencesProcessingAllowed: () => boolean;
  saleOfDataAllowed: () => boolean;
  marketingAllowed: () => boolean;
  analyticsProcessingAllowed: () => boolean;
  setTrackingConsent: (
    consent: Record<string, unknown>,
    callback: (data: {error: string} | undefined) => void,
  ) => void | Promise<unknown>;
  shouldShowBanner: () => boolean;
  [key: string]: unknown;
};

export type PrivacyBanner = {
  showPreferences: (...args: any[]) => Promise<void> | void;
  [key: string]: unknown;
};

export type AnalyticsProviderProps = {
  children?: ReactNode;
  /** Cart (or promise) to diff for cart_updated / product_added/removed events. */
  cart: Promise<CartReturn | null> | CartReturn | null;
  /** Override `canTrack` (defaults to Customer Privacy analytics consent). */
  canTrack?: () => boolean;
  /** Custom payload merged into every view/cart event. */
  customData?: Record<string, unknown>;
  /** Shop analytics data (use `getShopAnalytics`). `null` disables analytics. */
  shop: Promise<ShopAnalytics | null> | ShopAnalytics | null;
  consent: Consent;
  /**
   * Accepted for API compatibility. Cookie handling is owned by the new
   * `<ShopifyScripts>` and this value is not used.
   */
  cookieDomain?: string;
};

export type AnalyticsContextValue = {
  canTrack: () => boolean;
  cart: CartReturn | null;
  customData?: Record<string, unknown>;
  prevCart: CartReturn | null;
  publish: AnalyticsPublish;
  register: AnalyticsRegister;
  shop: ShopAnalytics | null;
  subscribe: AnalyticsSubscribe;
  privacyBanner: PrivacyBanner | null;
  customerPrivacy: CustomerPrivacy | null;
};

export type BasicViewProps = {
  data?: OtherData;
  customData?: OtherData;
};

export type ProductViewProps = {
  data: ProductsPayload;
  customData?: OtherData;
};

export type CollectionViewProps = {
  data: CollectionPayload;
  customData?: OtherData;
};

export type SearchViewProps = {
  data?: SearchPayload;
  customData?: OtherData;
};

export type CustomViewProps = {
  type: `custom_${string}`;
  data?: OtherData;
  customData?: OtherData;
};
