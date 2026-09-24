import {CACHE_LONG} from '~/data/cache';
import {LOCALIZATION_QUERY} from '~/data/graphql/storefront/shop';
import {routeHandler} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

async function loader({context}: LoaderArgs) {
  const {storefront} = context;
  const localization = await storefront.query(LOCALIZATION_QUERY, {
    variables: {
      country: storefront.i18n.country,
      language: storefront.i18n.language,
    },
    cache: storefront.CacheLong(),
  });

  return Response.json(
    {
      ...localization,
    },
    {
      headers: {
        'cache-control': CACHE_LONG,
      },
    },
  );
}

export const GET = routeHandler(loader);
