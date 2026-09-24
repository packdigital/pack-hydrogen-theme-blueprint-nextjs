/**
 * Analytics compatibility layer: the old `@shopify/hydrogen` (2026.4)
 * analytics API (`Analytics.*`, `useAnalytics`, `AnalyticsEvent`, ...) on top
 * of a local pub/sub bus that forwards standard events to the new Hydrogen
 * analytics bus created by `<ShopifyScripts>`.
 *
 * This module is intentionally NOT `'use client'`: constants and the
 * `Analytics` namespace object can be imported from server components (its
 * members are client components from `./AnalyticsProvider`).
 * `ShopifyScripts` lives in `./ShopifyScripts`; server-only helpers are also
 * available from `./shop`.
 */
import {
  AnalyticsCartView,
  AnalyticsCollectionView,
  AnalyticsCustomView,
  AnalyticsProductView,
  AnalyticsProvider,
  AnalyticsSearchView,
} from './AnalyticsProvider';

export {
  AnalyticsCartView,
  AnalyticsCollectionView,
  AnalyticsCustomView,
  AnalyticsProductView,
  AnalyticsProvider,
  AnalyticsSearchView,
  useAnalytics,
} from './AnalyticsProvider';

/** Old Hydrogen `Analytics` namespace. */
export const Analytics = {
  CartView: AnalyticsCartView,
  CollectionView: AnalyticsCollectionView,
  CustomView: AnalyticsCustomView,
  ProductView: AnalyticsProductView,
  Provider: AnalyticsProvider,
  SearchView: AnalyticsSearchView,
};

export {
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsPageType,
  isStandardAnalyticsEvent,
  STANDARD_ANALYTICS_EVENTS,
} from './events';
export type {AnalyticsEventType, StandardAnalyticsEventName} from './events';

export {getShopAnalytics, ShopifySalesChannel} from './shop';

export type * from './types';
