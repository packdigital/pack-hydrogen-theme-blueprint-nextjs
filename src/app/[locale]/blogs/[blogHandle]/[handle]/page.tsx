import {AnalyticsPageType} from '~/lib/analytics/shop';
import {ARTICLE_PAGE_QUERY} from '~/data/graphql/pack/article-page';
import {getPage} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {checkForTrailingEncodedSpaces} from '~/lib/server-utils/app.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import type {ArticlePage} from '~/lib/types';
import ArticleRoute from '~/routes/($locale).blogs.$blogHandle.$handle';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string; blogHandle: string; handle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle} = params;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const [{article}, shop, siteSettings] = await Promise.all([
    getPage({
      context,
      handle,
      pageKey: 'article',
      query: ARTICLE_PAGE_QUERY,
    }) as Promise<{article: ArticlePage}>,
    getShop(context),
    getSiteSettings(context),
  ]);

  // Shopify URL redirects run in `not-found.tsx`
  if (!article) throw new Response(null, {status: 404});

  const analytics = {pageType: AnalyticsPageType.article};
  const seo = seoPayload.article({
    page: article,
    shop,
    siteSettings,
    url: request.url,
  });

  return {
    analytics,
    article,
    seo,
    url: request.url,
  };
}

export type BlogArticleLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider
      id="routes/($locale).blogs.$blogHandle.$handle"
      data={data}
    >
      <JsonLd seo={[data.seo]} />
      <ArticleRoute />
    </RouteDataProvider>
  );
}
