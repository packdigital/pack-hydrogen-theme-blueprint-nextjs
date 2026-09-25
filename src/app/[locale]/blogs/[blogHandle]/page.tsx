import {AnalyticsPageType} from '~/lib/analytics/shop';
import {BLOG_PAGE_QUERY} from '~/data/graphql/pack/blog-page';
import {getPage} from '~/lib/server-utils/pack.server';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {checkForTrailingEncodedSpaces} from '~/lib/server-utils/app.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import type {BlogPage} from '~/lib/types';
import BlogRoute from '~/routes/($locale).blogs.$handle';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

/**
 * `/blogs/:handle` (formerly `routes/($locale).blogs.$handle.tsx`). The
 * segment is named `[blogHandle]` because Next requires sibling dynamic
 * segments to share a name with `blogs/[blogHandle]/[handle]` (articles).
 */
type Params = {locale?: string; blogHandle: string};

async function loader({params, context, request}: LoaderArgs<Params>) {
  const {blogHandle: handle} = params;

  if (!handle) throw new Response(null, {status: 404});

  // Check for trailing encoded spaces and redirect if needed
  const urlRedirect = checkForTrailingEncodedSpaces(request);
  if (urlRedirect) return urlRedirect;

  const MAX_PAGINATION_DEPTH = 50;

  // if the number of articles is in the several of hundreds, consider paginating the query
  const getBlogWithAllArticles = async ({
    blog,
    cursor,
    depth = 0,
  }: {
    blog: BlogPage | null;
    cursor: string | null;
    depth?: number;
  }): Promise<BlogPage | undefined> => {
    if (depth >= MAX_PAGINATION_DEPTH) {
      console.warn(
        `Blog "${handle}" pagination exceeded ${MAX_PAGINATION_DEPTH} pages, stopping`,
      );
      return blog ?? undefined;
    }

    const {pack, storefront} = context;
    const {data} = await pack.query(BLOG_PAGE_QUERY, {
      variables: {
        handle,
        articlesCursor: cursor,
        country: storefront.i18n.country,
        language: storefront.i18n.language,
      },
      cache: storefront.CacheLong(),
    });
    if (!data?.blog) return blog ?? undefined;

    const queriedBlog = data.blog;
    const queriedBlogArticles = queriedBlog.articles;

    const queriedBlogArticlesNodes = queriedBlogArticles?.nodes || [];
    const {endCursor, hasNextPage} = queriedBlogArticles?.pageInfo || {};

    const compiledBlog = {
      ...queriedBlog,
      articles: {
        nodes: [...(blog?.articles?.nodes || []), ...queriedBlogArticlesNodes],
        pageInfo: {endCursor, hasNextPage},
      },
    };
    if (hasNextPage && endCursor && endCursor !== cursor) {
      return getBlogWithAllArticles({
        blog: compiledBlog,
        cursor: endCursor,
        depth: depth + 1,
      });
    }
    return compiledBlog;
  };

  const [blogWithAllArticles, shop, siteSettings] = await Promise.all([
    getBlogWithAllArticles({
      blog: null,
      cursor: null,
    }),
    getShop(context),
    getSiteSettings(context),
  ]);

  // Shopify URL redirects run in `not-found.tsx`
  if (!blogWithAllArticles) throw new Response(null, {status: 404});

  let blog = blogWithAllArticles;
  if (blogWithAllArticles.sections.pageInfo.hasNextPage) {
    const {blog: blogWithAllSections} = await (getPage({
      context,
      handle,
      pageKey: 'blog',
      query: BLOG_PAGE_QUERY,
    }) as Promise<{blog: BlogPage}>);
    blog = {
      ...blogWithAllArticles,
      sections: blogWithAllSections.sections,
    };
  }

  const sortedArticles = blog.articles.nodes.sort((articleA, articleB) => {
    return articleA.firstPublishedAt > articleB.firstPublishedAt ? -1 : 1;
  });
  const blogWithSortedArticles = {
    ...blog,
    articles: {
      ...blog.articles,
      nodes: sortedArticles,
    },
  };

  const analytics = {pageType: AnalyticsPageType.blog};
  const seo = seoPayload.blog({
    page: blogWithSortedArticles,
    shop,
    siteSettings,
    url: request.url,
  });

  return {
    analytics,
    blog: blogWithSortedArticles,
    seo,
    url: request.url,
  };
}

export type BlogLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function BlogPageRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).blogs.$handle" data={data}>
      <JsonLd seo={[data.seo]} />
      <BlogRoute />
    </RouteDataProvider>
  );
}
