import type {ProductCollectionSortKeys} from '@shopify/hydrogen/storefront-api-types';

import {AnalyticsPageType} from '~/lib/analytics/shop';
import {COLLECTION_QUERY} from '~/data/graphql/storefront/collection';
import {COLLECTION_PAGE_QUERY} from '~/data/graphql/pack/collection-page';
import {getPage} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {getFilters} from '~/lib/server-utils/collection.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {checkForTrailingEncodedSpaces} from '~/lib/server-utils/app.server';
import {getPaginationVariables} from '~/lib/server/pagination';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import CollectionRoute from '~/routes/($locale).collections.$handle';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string; handle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const searchParams = new URL(request.url).searchParams;

  // Kick off fetches that don't depend on site settings or filters so they
  // run concurrently with the settings/filters resolution below instead of
  // waiting behind it.
  const collectionPagePromise = getPage({
    context,
    handle,
    pageKey: 'collectionPage',
    query: COLLECTION_PAGE_QUERY,
  });
  const shopPromise = getShop(context);

  const siteSettings = await getSiteSettings(context);

  const {activeFilterValues, filters} = await getFilters({
    handle,
    searchParams,
    siteSettings,
    storefront,
  });

  const sortKey = String(
    searchParams.get('sortKey')?.toUpperCase() ?? 'COLLECTION_DEFAULT',
  ) as ProductCollectionSortKeys;
  const reverse = Boolean(searchParams.get('reverse') ?? false);

  const resultsPerPage = Math.floor(
    Number(
      siteSettings?.data?.siteSettings?.settings?.collection?.pagination
        ?.resultsPerPage,
    ) || 24,
  );

  const paginationVariables = getPaginationVariables(request, {
    pageBy: resultsPerPage,
  });

  const [{collectionPage}, {collection}, shop] = await Promise.all([
    collectionPagePromise,
    storefront.query(COLLECTION_QUERY, {
      variables: {
        handle,
        sortKey,
        reverse,
        filters,
        country: storefront.i18n.country,
        language: storefront.i18n.language,
        ...paginationVariables,
      },
      cache: storefront.CacheShort(),
    }),
    shopPromise,
  ]);

  // Shopify URL redirects run in `not-found.tsx`
  if (!collection) throw new Response(null, {status: 404});

  const analytics = {
    pageType: AnalyticsPageType.collection,
    collectionHandle: handle,
    resourceId: collection.id,
  };
  const seo = seoPayload.collection({
    collection,
    page: collectionPage,
    shop,
    siteSettings,
    url: request.url,
  });

  return {
    activeFilterValues,
    analytics,
    collection,
    collectionPage,
    seo,
    url: request.url,
  };
}

export type CollectionLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function CollectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).collections.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <CollectionRoute />
    </RouteDataProvider>
  );
}
