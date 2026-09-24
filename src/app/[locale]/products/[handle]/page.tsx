import {AnalyticsPageType} from '~/lib/analytics/shop';
import type {ShopifyAnalyticsProduct} from '~/lib/analytics';
import {normalizeAdminProduct} from '~/lib/utils';
import {getPage, getProductGroupings} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {
  getProductWithInitialGrouping,
  getSelectedProductOptions,
} from '~/lib/server-utils/product.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {checkForTrailingEncodedSpaces} from '~/lib/server-utils/app.server';
import {PRODUCT_PAGE_QUERY} from '~/data/graphql/pack/product-page';
import {ADMIN_PRODUCT_QUERY} from '~/data/graphql/admin/product';
import {PRODUCT_QUERY} from '~/data/graphql/storefront/product';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import ProductRoute from '~/routes/($locale).products.$handle';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string; handle: string};

/*
 * To add metafields to product object, update the PRODUCT_METAFIELDS_IDENTIFIERS
 * constant under lib/constants/product.ts
 */

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle} = params;
  const {admin, pack, storefront} = context;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const storeDomain = storefront.getShopifyDomain();
  const isPreviewModeEnabled = pack.isPreviewModeEnabled();

  // Kick off fetches that don't depend on selectedOptions immediately so they
  // run concurrently with getSelectedProductOptions (which can itself query
  // the Storefront API) rather than waiting behind it. Only PRODUCT_QUERY
  // needs the resolved options.
  const productPagePromise = getPage({
    context,
    handle,
    pageKey: 'productPage',
    query: PRODUCT_PAGE_QUERY,
  });
  const productGroupingsPromise = getProductGroupings(context);
  const shopPromise = getShop(context);
  const siteSettingsPromise = getSiteSettings(context);

  const selectedOptions = await getSelectedProductOptions({
    handle,
    context,
    request,
  });

  const [
    {productPage},
    {product: storefrontProduct},
    productGroupings,
    shop,
    siteSettings,
  ] = await Promise.all([
    productPagePromise,
    storefront.query(PRODUCT_QUERY, {
      variables: {
        handle,
        selectedOptions,
        country: storefront.i18n.country,
        language: storefront.i18n.language,
      },
      cache: storefront.CacheShort(),
    }),
    productGroupingsPromise,
    shopPromise,
    siteSettingsPromise,
  ]);

  let queriedProduct = storefrontProduct;
  let productStatus = 'ACTIVE';

  if (admin && isPreviewModeEnabled) {
    if (!queriedProduct) {
      const {productByIdentifier: adminProduct} = await admin.query(
        ADMIN_PRODUCT_QUERY,
        {variables: {handle}, cache: admin.CacheShort()},
      );
      if (adminProduct) {
        queriedProduct = normalizeAdminProduct(adminProduct);
        productStatus = adminProduct.status;
      }
    }
  }

  // Shopify URL redirects run in `not-found.tsx`
  if (!queriedProduct) throw new Response(null, {status: 404});

  const product = await getProductWithInitialGrouping({
    context,
    product: queriedProduct,
    productGroupings,
  });

  const selectedVariant = product.selectedVariant ?? product.variants?.nodes[0];

  const productAnalytics: ShopifyAnalyticsProduct = {
    productGid: product.id,
    variantGid: selectedVariant?.id || '',
    name: product.title,
    variantName: selectedVariant?.title || '',
    brand: product.vendor,
    price: selectedVariant?.price?.amount || '',
  };
  const analytics = {
    pageType: AnalyticsPageType.product,
    resourceId: product.id,
    products: [productAnalytics],
    totalValue: Number(selectedVariant?.price?.amount || 0),
  };
  const seo = seoPayload.product({
    product,
    selectedVariant,
    page: productPage,
    shop,
    siteSettings,
    url: request.url,
  });

  return {
    analytics,
    product,
    productPage,
    productStatus,
    selectedVariant,
    seo,
    storeDomain,
    url: request.url,
  };
}

export type ProductLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function ProductPage({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).products.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <ProductRoute />
    </RouteDataProvider>
  );
}
