import {createShopifyRouteTemplates} from '@shopify/hydrogen';

// Shopify standard storefront routes are handled at their default paths
// (/products/:handle, /collections/:handle, /pages/:handle, /blogs/:blog/:article,
// /cart, /search). Add entries here if the app moves any of them.
export const routeTemplates = createShopifyRouteTemplates({});
