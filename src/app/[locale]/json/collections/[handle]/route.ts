import {COLLECTION_QUERY} from '~/data/graphql/storefront/collection';
import {transformShopifyGids} from '~/lib/utils';
import {getPaginationVariables} from '~/lib/server/pagination';
import {routeHandler} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

/**
 * `/collections/:handle.json` (formerly `routes/($locale).collections.$handle[.]json.tsx`).
 * The proxy rewrites `.json` URLs to this handler.
 */

type Params = {locale?: string; handle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) throw new Response(null, {status: 404});

  const paginationVariables = getPaginationVariables(request, {
    pageBy: 24,
  });

  const collection = await storefront.query(COLLECTION_QUERY, {
    variables: {
      handle,
      country: storefront.i18n.country,
      language: storefront.i18n.language,
      ...paginationVariables,
    },
    cache: storefront.CacheShort(),
  });

  if (!collection) throw new Response(null, {status: 404});
  const transformedCollection = transformShopifyGids(collection);

  return Response.json(transformedCollection);
}

export const GET = routeHandler(loader);
