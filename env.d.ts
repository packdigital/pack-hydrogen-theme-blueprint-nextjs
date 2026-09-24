declare global {
  /**
   * Environment variables read on the server via `getEnv()`
   * (`~/lib/server/env`). Only `PUBLIC_*` values are ever serialized to the
   * browser, through the root layout's `ENV` object.
   */
  interface Env {
    PACK_PUBLIC_TOKEN: string;
    PACK_SECRET_TOKEN: string;
    PACK_STOREFRONT_ID: string;
    PRIMARY_DOMAIN: string;
    PRIVATE_ADMIN_API_TOKEN: string;
    PRIVATE_SHOPIFY_CHECKOUT_DOMAIN?: string;
    PRIVATE_STOREFRONT_API_TOKEN: string;
    PUBLIC_CHECKOUT_DOMAIN: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_URL: string;
    PUBLIC_PACK_CONTENT_ENVIRONMENT?: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_API_TOKEN: string;
    PUBLIC_STOREFRONT_ID: string;
    SESSION_SECRET: string;
    SHOP_ID: string;
    PLAYBOOK_PLATFORM_URL?: string;
    [key: string]: string | undefined;
  }

  interface Window {
    ENV?: Record<string, string>;
    unHover?: ReturnType<typeof setTimeout> | null;
    __pack_is_cart_ready?: boolean;
    __pack_cart_status?: string;
    dataLayer?: any[];
    // Elevar
    ElevarDataLayer?: any[];
    ElevarInvalidateContext?: () => void;
    // Meta pixel
    fbq?: Function;
    // TikTok pixel
    ttq?: Record<string, any>;
    // Fueled
    fueled?: any;
    fueledConfig?: Record<string, any>;
    // Klaviyo
    klaviyo?: any;
    // Blotout
    edgetag?: Function;
    OneTrust?: any;
  }
}

export {};
