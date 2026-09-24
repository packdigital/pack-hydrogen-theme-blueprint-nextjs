import {getSelectedProductOptions} from '~/lib/server-utils/product.server';
import {PRODUCT_QUERY} from '~/data/graphql/storefront/product';
import {transformShopifyGids} from '~/lib/utils';
import {routeHandler} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

/**
 * `/products/:handle.json` (formerly `routes/($locale).products.$handle[.]json.tsx`).
 * The proxy rewrites `.json` URLs to this handler.
 */

type Params = {locale?: string; handle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle} = params;
  const {storefront} = context;

  const selectedOptions = await getSelectedProductOptions({
    handle,
    context,
    request,
  });

  const product = await storefront.query(PRODUCT_QUERY, {
    variables: {
      handle,
      selectedOptions,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheShort(),
  });

  const transformedProduct = transformShopifyGids(product);

  return Response.json(transformedProduct);
}

export const GET = routeHandler(loader);
