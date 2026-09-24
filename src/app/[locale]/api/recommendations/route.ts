import {PRODUCT_RECOMMENDATIONS_QUERY} from '~/data/graphql/storefront/product';
import {routeHandler} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

// docs: https://shopify.dev/docs/api/storefront/latest/queries/productRecommendations

async function loader({request, context}: LoaderArgs) {
  const {storefront} = context;
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const productId = String(searchParams.get('productId') || '');
  const intent = String(searchParams.get('intent') || 'RELATED');

  if (!productId)
    return Response.json(
      {products: null, errors: ['Missing product `productId` parameter']},
      {status: 500},
    );

  const {productRecommendations} = await storefront.query(
    PRODUCT_RECOMMENDATIONS_QUERY,
    {
      variables: {
        productId,
        intent,
        country: storefront.i18n.country,
        language: storefront.i18n.language,
      },
      cache: storefront.CacheLong(),
    },
  );

  return Response.json({productRecommendations});
}

export const GET = routeHandler(loader);
