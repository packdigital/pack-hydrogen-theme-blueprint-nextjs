'use client';

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {Dispatch, ReactNode, SetStateAction} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';

import {normalizePathname} from '~/lib/router';

import {
  getCustomerPrivacy,
  getPrivacyBanner,
  getRegistersKey,
  hasVisitorConsentDecision,
  isCustomerPrivacyLoaded,
  publish as busPublish,
  register as busRegister,
  shopifyCanTrack,
  subscribe as busSubscribe,
} from './bus';
import {AnalyticsEvent, type AnalyticsEventType} from './events';
import type {
  AnalyticsContextValue,
  AnalyticsProviderProps,
  AnalyticsPublish,
  BasicViewProps,
  CartReturn,
  CollectionViewProps,
  CustomViewProps,
  OtherData,
  ProductViewProps,
  SearchViewProps,
  ShopAnalytics,
} from './types';

/**
 * Next.js port of the old `@shopify/hydrogen` (2026.4) `Analytics.Provider`,
 * `useAnalytics()` and view components. See `./bus.ts` for the event bus.
 */

const INTERNAL_PRIVACY_REGISTER = 'Internal_Shopify_Analytics';

const noopPublish: AnalyticsPublish = () => {};
const alwaysFalse = () => false;

const defaultAnalyticsContext: AnalyticsContextValue = {
  canTrack: alwaysFalse,
  cart: null,
  customData: {},
  prevCart: null,
  publish: noopPublish,
  shop: null,
  subscribe: () => () => {},
  register: () => ({ready: () => {}}),
  customerPrivacy: null,
  privacyBanner: null,
};

const AnalyticsContext = createContext<AnalyticsContextValue>(
  defaultAnalyticsContext,
);

/** Old Hydrogen `useAnalytics()`. */
export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function usePageUrl() {
  const pathname = normalizePathname(usePathname());
  const search = useSearchParams()?.toString() || '';
  return `${pathname}${search ? `?${search}` : ''}`;
}

function flattenLines(lines: any): any[] {
  if (!lines) return [];
  if (Array.isArray(lines)) return lines;
  if (Array.isArray(lines.nodes)) return lines.nodes;
  if (Array.isArray(lines.edges)) return lines.edges.map((e: any) => e.node);
  return [];
}

function logMissingField(fieldName: string) {
  console.error(
    `[h2:error:CartAnalytics] Can't set up cart analytics events because the \`cart.${fieldName}\` value is missing from your GraphQL cart query.`,
  );
}

function useResolved<T>(value: Promise<T> | T): T | null {
  const [resolved, setResolved] = useState<T | null>(() =>
    value && typeof (value as any).then === 'function' ? null : (value as T),
  );
  useEffect(() => {
    let active = true;
    Promise.resolve(value).then((v) => {
      if (active) setResolved(v ?? null);
    });
    return () => {
      active = false;
    };
  }, [value]);
  return resolved;
}

type Carts = {cart: CartReturn | null; prevCart: CartReturn | null};

/* -------------------------------------------------------------------------- */
/* Cart analytics (port of old `CartAnalytics`)                                */
/* -------------------------------------------------------------------------- */

function CartAnalytics({
  cart: currentCart,
  setCarts,
}: {
  cart: AnalyticsProviderProps['cart'];
  setCarts: Dispatch<SetStateAction<Carts>>;
}) {
  const {publish, shop, customData, canTrack, cart, prevCart} = useAnalytics();
  const lastEventId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentCart) return;
    Promise.resolve(currentCart).then((updatedCart) => {
      if (updatedCart && updatedCart.lines) {
        if (!updatedCart.id) {
          logMissingField('id');
          return;
        }
        if (!updatedCart.updatedAt) {
          logMissingField('updatedAt');
          return;
        }
      }
      setCarts(({cart: cart2, prevCart: prevCart2}) => {
        return updatedCart?.updatedAt !== cart2?.updatedAt
          ? {cart: updatedCart, prevCart: cart2}
          : {cart: cart2, prevCart: prevCart2};
      });
    });
  }, [setCarts, currentCart]);

  useEffect(() => {
    if (!cart || !cart?.updatedAt) return;
    if (cart?.updatedAt === prevCart?.updatedAt) return;

    let cartLastUpdatedAt: {id?: string; updatedAt?: string} | null;
    try {
      cartLastUpdatedAt = JSON.parse(
        localStorage.getItem('cartLastUpdatedAt') || '',
      );
    } catch {
      cartLastUpdatedAt = null;
    }
    if (
      cart.id === cartLastUpdatedAt?.id &&
      cart.updatedAt === cartLastUpdatedAt?.updatedAt
    )
      return;

    const payload = {
      eventTimestamp: Date.now(),
      cart,
      prevCart,
      shop,
      customData,
    };

    if (cart.updatedAt === lastEventId.current) return;
    lastEventId.current = cart.updatedAt;

    publish(AnalyticsEvent.CART_UPDATED, payload);

    try {
      localStorage.setItem(
        'cartLastUpdatedAt',
        JSON.stringify({id: cart.id, updatedAt: cart.updatedAt}),
      );
    } catch {
      // ignore storage failures (private mode / quota)
    }

    const previousCartLines = prevCart?.lines
      ? flattenLines(prevCart.lines)
      : [];
    const currentCartLines = cart.lines ? flattenLines(cart.lines) : [];

    previousCartLines.forEach((prevLine) => {
      const matchedLineId = currentCartLines.filter(
        (line) => prevLine.id === line.id,
      );
      if (matchedLineId?.length === 1) {
        const matchedLine = matchedLineId[0];
        if (prevLine.quantity < matchedLine.quantity) {
          publish(AnalyticsEvent.PRODUCT_ADD_TO_CART, {
            ...payload,
            prevLine,
            currentLine: matchedLine,
          });
        } else if (prevLine.quantity > matchedLine.quantity) {
          publish(AnalyticsEvent.PRODUCT_REMOVED_FROM_CART, {
            ...payload,
            prevLine,
            currentLine: matchedLine,
          });
        }
      } else {
        publish(AnalyticsEvent.PRODUCT_REMOVED_FROM_CART, {
          ...payload,
          prevLine,
        });
      }
    });

    currentCartLines.forEach((line) => {
      const matchedLineId = previousCartLines.filter(
        (previousLine) => line.id === previousLine.id,
      );
      if (!matchedLineId || matchedLineId.length === 0) {
        publish(AnalyticsEvent.PRODUCT_ADD_TO_CART, {
          ...payload,
          currentLine: line,
        });
      }
    });
  }, [cart, prevCart, publish, shop, customData, canTrack]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* Customer privacy readiness (replaces old `ShopifyAnalytics`)                */
/* -------------------------------------------------------------------------- */

/**
 * Registers the internal privacy gate and marks it ready once the Customer
 * Privacy API loaded by `<ShopifyScripts>` is available (and, with the
 * privacy banner, once the visitor has a consent decision) — mirroring old
 * Hydrogen, which held the event queue until privacy was ready.
 */
function useCustomerPrivacyReady({
  enabled,
  withPrivacyBanner,
  onChange,
}: {
  enabled: boolean;
  withPrivacyBanner: boolean;
  onChange: () => void;
}) {
  const [privacyReady, setPrivacyReady] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const {ready} = busRegister(INTERNAL_PRIVACY_REGISTER);

    let consentCollected = false;
    let done = false;
    const markReady = () => {
      if (done) return;
      done = true;
      ready();
      setPrivacyReady(true);
      onChangeRef.current();
    };
    const check = () => {
      if (!isCustomerPrivacyLoaded()) return;
      if (
        withPrivacyBanner &&
        !consentCollected &&
        !hasVisitorConsentDecision()
      )
        return;
      markReady();
    };
    const onApiLoaded = () => {
      check();
      onChangeRef.current();
    };
    const onConsentCollected = () => {
      consentCollected = true;
      markReady();
      // canTrack() may have changed; re-evaluate the context value
      onChangeRef.current();
    };

    document.addEventListener('consentTrackingApiLoaded', onApiLoaded);
    document.addEventListener('shopifyCustomerPrivacyApiLoaded', onApiLoaded);
    document.addEventListener('visitorConsentCollected', onConsentCollected);
    check();

    return () => {
      document.removeEventListener('consentTrackingApiLoaded', onApiLoaded);
      document.removeEventListener(
        'shopifyCustomerPrivacyApiLoaded',
        onApiLoaded,
      );
      document.removeEventListener(
        'visitorConsentCollected',
        onConsentCollected,
      );
    };
  }, [enabled, withPrivacyBanner]);

  return privacyReady;
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

/** Old Hydrogen `<Analytics.Provider>`. */
export function AnalyticsProvider({
  canTrack: customCanTrack,
  cart: currentCart,
  children,
  consent,
  customData = defaultAnalyticsContext.customData,
  shop: shopProp = null,
}: AnalyticsProviderProps) {
  const shop = useResolved<ShopAnalytics | null>(shopProp);
  const [carts, setCarts] = useState<Carts>({cart: null, prevCart: null});
  const [consentVersion, setConsentVersion] = useState(0);

  const withPrivacyBanner =
    consent?.mode !== undefined
      ? consent.mode === 'default-banner'
      : !!consent?.withPrivacyBanner;

  const privacyReady = useCustomerPrivacyReady({
    enabled: !!shop && !customCanTrack,
    withPrivacyBanner,
    onChange: () => setConsentVersion((v) => v + 1),
  });

  const canTrack = customCanTrack ?? shopifyCanTrack;
  const registersKey = typeof window !== 'undefined' ? getRegistersKey() : '';

  const value = useMemo<AnalyticsContextValue>(() => {
    const trackable = typeof window !== 'undefined' && canTrack();
    return {
      canTrack,
      ...carts,
      customData,
      publish: trackable ? busPublish : noopPublish,
      shop,
      subscribe: busSubscribe,
      register: busRegister,
      customerPrivacy:
        typeof window !== 'undefined' ? getCustomerPrivacy() : null,
      privacyBanner: typeof window !== 'undefined' ? getPrivacyBanner() : null,
    };
    // consentVersion / privacyReady / registersKey intentionally re-evaluate
    // canTrack() and the privacy globals, like the old provider's deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canTrack,
    carts,
    customData,
    shop,
    consentVersion,
    privacyReady,
    registersKey,
  ]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {!!shop && (
        <Suspense fallback={null}>
          <AnalyticsView type={AnalyticsEvent.PAGE_VIEWED} />
        </Suspense>
      )}
      {!!shop && !!currentCart && (
        <CartAnalytics cart={currentCart} setCarts={setCarts} />
      )}
    </AnalyticsContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

function AnalyticsView(props: {
  type: AnalyticsEventType;
  data?: OtherData;
  customData?: OtherData;
}) {
  const {type, data = {}, customData} = props;
  const url = usePageUrl();
  const {
    publish,
    cart,
    prevCart,
    shop,
    customData: analyticProviderCustomData,
  } = useAnalytics();

  const viewPayload = {
    ...data,
    customData: {
      ...analyticProviderCustomData,
      ...customData,
    },
    cart,
    prevCart,
    shop,
  };

  useEffect(() => {
    if (!shop?.shopId) return;
    publish(type, {...viewPayload, url: window.location.href});
    // Same deps as old Hydrogen: re-publish on route change or when publish
    // switches from no-op to live (consent granted).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, url, shop?.shopId]);

  return null;
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={null}>{node}</Suspense>;
}

export function AnalyticsProductView(props: ProductViewProps) {
  return withSuspense(
    <AnalyticsView {...props} type={AnalyticsEvent.PRODUCT_VIEWED} />,
  );
}

export function AnalyticsCollectionView(props: CollectionViewProps) {
  return withSuspense(
    <AnalyticsView {...props} type={AnalyticsEvent.COLLECTION_VIEWED} />,
  );
}

export function AnalyticsCartView(props: BasicViewProps) {
  return withSuspense(
    <AnalyticsView {...props} type={AnalyticsEvent.CART_VIEWED} />,
  );
}

export function AnalyticsSearchView(props: SearchViewProps) {
  return withSuspense(
    <AnalyticsView {...props} type={AnalyticsEvent.SEARCH_VIEWED} />,
  );
}

export function AnalyticsCustomView(props: CustomViewProps) {
  return withSuspense(<AnalyticsView {...props} />);
}
