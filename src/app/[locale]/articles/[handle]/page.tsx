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
import ArticleRoute from '~/routes/($locale).articles.$handle';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string; handle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {handle, locale} = params;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const {article} = await (getPage({
    context,
    handle,
    pageKey: 'article',
    query: ARTICLE_PAGE_QUERY,
  }) as Promise<{article: ArticlePage}>);

  // Shopify URL redirects run in `not-found.tsx`
  if (!article) throw new Response(null, {status: 404});

  if (article.blog) {
    // If the article has a blog, redirect to the new path
    const blogHandle = article.blog.handle;
    const newPath = locale
      ? `/${locale}/blogs/${blogHandle}/${handle}`
      : `/blogs/${blogHandle}/${handle}`;
    return new Response(null, {status: 301, headers: {Location: newPath}});
  } else {
    // If the article exists but has no blog, don't redirect
    const [shop, siteSettings] = await Promise.all([
      getShop(context),
      getSiteSettings(context),
    ]);
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
}

export type ArticleLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function ArticlePageRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).articles.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <ArticleRoute />
    </RouteDataProvider>
  );
}
