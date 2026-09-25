import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getPage} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {getProductsMapForPage} from '~/lib/server-utils/product.server';
import {checkForTrailingEncodedSpaces} from '~/lib/server-utils/app.server';
import {PAGE_QUERY} from '~/data/graphql/pack/page';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import PageRoute from '~/routes/($locale).pages.$handle';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string; handle: string};

async function loader({context, params, request}: LoaderArgs<Params>) {
  const {handle} = params;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const [{page}, shop, siteSettings] = await Promise.all([
    getPage({context, handle, pageKey: 'page', query: PAGE_QUERY}),
    getShop(context),
    getSiteSettings(context),
  ]);

  // Shopify URL redirects run in `not-found.tsx`
  if (!page) throw new Response(null, {status: 404});

  /* Certain product sections require fetching products before page load */
  const productsMap = await getProductsMapForPage({
    context,
    page,
  });

  const isPolicy = handle?.includes('privacy') || handle?.includes('policy');
  const analytics = {
    pageType: isPolicy ? AnalyticsPageType.policy : AnalyticsPageType.page,
  };
  const seo = seoPayload.page({
    page,
    shop,
    siteSettings,
  });

  return {
    analytics,
    page,
    productsMap,
    seo,
    url: request.url,
  };
}

export type PageLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function PagesPage({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).pages.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <PageRoute />
    </RouteDataProvider>
  );
}
