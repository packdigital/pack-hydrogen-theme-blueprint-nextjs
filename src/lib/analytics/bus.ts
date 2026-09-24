/**
 * Local analytics pub/sub bus.
 *
 * Ports the module-level bus from the old `@shopify/hydrogen` (2026.4)
 * `AnalyticsProvider`:
 * - `subscribe(event, cb)` for every event (standard + app `custom_*`).
 * - `register(key).ready()` gating: while any registered integration is not
 *   ready, published events are queued (latest payload per event, like the
 *   old implementation) and flushed once every registration is ready.
 * - `canTrack()` driven by Shopify Customer Privacy.
 *
 * Standard events are additionally forwarded to the new Hydrogen analytics
 * bus (`window.Shopify.analytics`, created by `<ShopifyScripts>`), which owns
 * Shopify analytics and consent-gated destination delivery. The old monorail
 * sending is intentionally NOT ported.
 *
 * Browser-only at runtime; every entry point no-ops on the server so module
 * state is never shared between requests.
 */
import {isStandardAnalyticsEvent, type AnalyticsEventType} from './events';
import type {CustomerPrivacy, PrivacyBanner} from './types';

type Callback = (payload: any) => void;

const isBrowser = () => typeof window !== 'undefined';

const subscribers = new Map<string, Set<Callback>>();
const registers: Record<string, boolean> = {};
const waitForReadyQueue = new Map<string, any>();

function areRegistersReady() {
  return Object.values(registers).every(Boolean);
}

export function subscribe(
  event: AnalyticsEventType,
  callback: Callback,
): () => void {
  if (!isBrowser()) return () => {};
  let callbacks = subscribers.get(event);
  if (!callbacks) {
    callbacks = new Set();
    subscribers.set(event, callbacks);
  }
  callbacks.add(callback);
  return () => {
    subscribers.get(event)?.delete(callback);
  };
}

function deliver(event: string, payload: any) {
  (subscribers.get(event) ?? new Set<Callback>()).forEach((callback) => {
    try {
      callback(payload);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Analytics publish error', error.message, error.stack);
      } else {
        console.error('Analytics publish error', error);
      }
    }
  });
}

/** Publish without any consent check (the provider gates via `canTrack`). */
export function publish(event: AnalyticsEventType, payload?: any) {
  if (!isBrowser()) return;
  forwardToShopifyAnalytics(event, payload);
  if (!areRegistersReady()) {
    waitForReadyQueue.set(event, payload);
    return;
  }
  deliver(event, payload);
}

export function register(key: string) {
  if (!isBrowser()) return {ready: () => {}};
  if (!Object.prototype.hasOwnProperty.call(registers, key)) {
    registers[key] = false;
  }
  return {
    ready: () => {
      registers[key] = true;
      if (areRegistersReady() && waitForReadyQueue.size > 0) {
        const queued = [...waitForReadyQueue.entries()];
        waitForReadyQueue.clear();
        queued.forEach(([queueEvent, queuePayload]) => {
          deliver(queueEvent, queuePayload);
        });
      }
    },
  };
}

/** Snapshot of registration state (used to re-render consumers). */
export function getRegistersKey() {
  return JSON.stringify(registers);
}

/* -------------------------------------------------------------------------- */
/* Customer Privacy                                                            */
/* -------------------------------------------------------------------------- */

export function getCustomerPrivacy(): CustomerPrivacy | null {
  try {
    const cp = window.Shopify?.customerPrivacy as unknown as
      (Partial<CustomerPrivacy> & {consentStatus?: string}) | undefined;
    return cp && typeof cp.setTrackingConsent === 'function'
      ? (cp as CustomerPrivacy)
      : null;
  } catch {
    return null;
  }
}

export function getPrivacyBanner(): PrivacyBanner | null {
  try {
    return (window?.privacyBanner as unknown as PrivacyBanner) || null;
  } catch {
    return null;
  }
}

/** Customer Privacy API has loaded (the `<ShopifyScripts>` consent script). */
export function isCustomerPrivacyLoaded() {
  try {
    const cp = window.Shopify?.customerPrivacy as
      | {consentStatus?: string; analyticsProcessingAllowed?: unknown}
      | undefined;
    if (!cp) return false;
    if (cp.consentStatus !== undefined) return cp.consentStatus === 'loaded';
    return typeof cp.analyticsProcessingAllowed === 'function';
  } catch {
    return false;
  }
}

/**
 * Whether the visitor can be tracked. Mirrors old Hydrogen's
 * `analyticsProcessingAllowed()` check, with the new bus's extra guards for
 * the async consent API (not yet loaded / explicit analytics "no").
 */
export function shopifyCanTrack(): boolean {
  try {
    const cp = window.Shopify?.customerPrivacy as
      (Partial<CustomerPrivacy> & {consentStatus?: string}) | undefined;
    if (!cp) return false;
    if (cp.consentStatus !== undefined && cp.consentStatus !== 'loaded') {
      return false;
    }
    const consent = cp.currentVisitorConsent?.();
    if (consent && typeof consent === 'object' && consent.analytics === 'no') {
      return false;
    }
    return cp.analyticsProcessingAllowed?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * With the privacy banner, old Hydrogen treated privacy as ready only once
 * visitor consent was collected. Returning visitors (or regions where no
 * banner is shown) already have a decision, so treat those as collected too.
 */
export function hasVisitorConsentDecision() {
  const cp = getCustomerPrivacy();
  if (!cp) return false;
  try {
    if (!cp.shouldShowBanner?.()) return true;
    const consent = cp.currentVisitorConsent?.();
    if (!consent || typeof consent !== 'object') return false;
    return ['marketing', 'analytics', 'preferences'].some(
      (key) => !!consent[key],
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Forwarding to the new Hydrogen bus                                          */
/* -------------------------------------------------------------------------- */

function forwardToShopifyAnalytics(event: string, payload: any = {}) {
  if (!isStandardAnalyticsEvent(event)) return;
  const bus = window.Shopify?.analytics;
  if (!bus) return;
  const p = payload || {};
  const url = typeof p.url === 'string' && p.url ? {url: p.url} : {};
  try {
    switch (event) {
      case 'page_viewed':
        bus.publish(event, {...url});
        break;
      case 'product_viewed':
        if (!Array.isArray(p.products)) return;
        bus.publish(event, {products: p.products, ...url});
        break;
      case 'collection_viewed':
        if (!p.collection) return;
        bus.publish(event, {collection: p.collection, ...url});
        break;
      case 'search_viewed':
        bus.publish(event, {
          searchTerm: p.searchTerm ?? '',
          searchResults: p.searchResults,
          ...url,
        });
        break;
      case 'cart_viewed':
        bus.publish(event, {cart: p.cart ?? null, ...url});
        break;
      case 'cart_updated':
        bus.publish(event, {
          cart: p.cart ?? null,
          prevCart: p.prevCart ?? null,
        });
        break;
      case 'product_added_to_cart':
      case 'product_removed_from_cart':
        bus.publish(event, {
          cart: p.cart ?? null,
          prevCart: p.prevCart ?? null,
          ...(p.prevLine ? {prevLine: p.prevLine} : {}),
          ...(p.currentLine ? {currentLine: p.currentLine} : {}),
        });
        break;
    }
  } catch (error) {
    console.error('[analytics] failed to forward event to Shopify', error);
  }
}
