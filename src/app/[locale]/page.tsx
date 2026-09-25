import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getPage} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {PAGE_QUERY} from '~/data/graphql/pack/page';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import Index from '~/routes/($locale)._index';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string};

async function loader({context, params, request}: LoaderArgs<Params>) {
  const {storefront} = context;
  const {language, country} = storefront.i18n;

  if (
    params.locale &&
    params.locale.toLowerCase() !== `${language}-${country}`.toLowerCase()
  ) {
    // If the locale URL param is defined, yet we still are on `EN-US`
    // the the locale param must be invalid, send to the 404 page
    throw new Response(null, {status: 404});
  }

  const [{page}, shop, siteSettings] = await Promise.all([
    getPage({
      context,
      handle: '/',
      pageKey: 'page',
      query: PAGE_QUERY,
    }),
    getShop(context),
    getSiteSettings(context),
  ]);

  if (!page) throw new Response(null, {status: 404});

  const analytics = {pageType: AnalyticsPageType.home};
  const seo = seoPayload.home({
    page,
    shop,
    siteSettings,
  });

  return {
    analytics,
    page,
    seo,
    url: request.url,
  };
}

export type IndexLoaderData = Awaited<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function IndexPage({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale)._index" data={data}>
      <JsonLd seo={[data.seo]} />
      <Index />
    </RouteDataProvider>
  );
}
