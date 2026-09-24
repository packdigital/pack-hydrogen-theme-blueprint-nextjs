import type {Storefront} from './storefront';

/**
 * Port of `getSitemapIndex` / `getSitemap` from the React Router
 * `@shopify/hydrogen` (not part of the framework-agnostic toolkit). Output
 * XML, headers and thrown 404 `Response`s are unchanged.
 */

export type SitemapIndexType =
  'pages' | 'products' | 'collections' | 'blogs' | 'articles' | 'metaObjects';

type StorefrontLike = Pick<Storefront, 'query'>;

export interface SitemapIndexOptions {
  /** The Storefront API client */
  storefront: StorefrontLike;
  /** The incoming request */
  request: Request;
  /** The types of pages to include in the sitemap index. */
  types?: SitemapIndexType[];
  /** Add a URL to a custom child sitemap */
  customChildSitemaps?: string[];
}

export interface GetSitemapOptions {
  /** Route params (`type`, `page`) */
  params: Record<string, string | string[] | undefined>;
  /** The Storefront API client */
  storefront: StorefrontLike;
  /** The incoming request */
  request: Request;
  /** A function that produces a canonical url for a resource. It is called multiple times for each locale supported by the app. */
  getLink: (options: {
    type: string | SitemapIndexType;
    baseUrl: string;
    handle?: string;
    locale?: string;
  }) => string;
  /** An array of locales to generate alternate tags */
  locales?: string[];
  /** Optionally customize the changefreq property for each URL */
  getChangeFreq?: (options: {
    type: string | SitemapIndexType;
    handle: string;
  }) => string;
  /** If the sitemap has no links, fallback to rendering a link to the homepage. Defaults to `/`. */
  noItemsFallback?: string;
}

const SITEMAP_INDEX_PREFIX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
const SITEMAP_INDEX_SUFFIX = `
</sitemapindex>`;
const SITEMAP_PREFIX = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`;
const SITEMAP_SUFFIX = `</urlset>`;

type SitemapIndexData = Partial<
  Record<SitemapIndexType, {pagesCount: {count: number}} | null>
>;

type SitemapItem = {handle: string; updatedAt: string; type?: string};
type SitemapData = {
  sitemap?: {resources?: {items?: SitemapItem[]} | null} | null;
};

export async function getSitemapIndex(
  options: SitemapIndexOptions,
): Promise<Response> {
  const {
    storefront,
    request,
    types = [
      'products',
      'pages',
      'collections',
      'metaObjects',
      'articles',
      'blogs',
    ],
    customChildSitemaps = [],
  } = options;

  if (!request || !request.url)
    throw new Error('A request object is required to generate a sitemap index');
  if (!storefront || !storefront.query)
    throw new Error(
      'A storefront client is required to generate a sitemap index',
    );

  const data = await storefront.query<SitemapIndexData>(SITEMAP_INDEX_QUERY);

  if (!data) {
    console.warn(
      '[h2:sitemap:warning] Sitemap index is available in API version 2024-10 and later',
    );
    throw new Response('Sitemap index not found.', {status: 404});
  }

  const baseUrl = new URL(request.url).origin;

  const body =
    SITEMAP_INDEX_PREFIX +
    types
      .map((type) => {
        const typeData = data[type];
        if (!typeData) {
          throw new Error(
            `[h2:sitemap:error] No data found for type ${type}. Check types passed to \`getSitemapIndex\``,
          );
        }
        return getSiteMapLinks(type, typeData.pagesCount.count, baseUrl);
      })
      .join('\n') +
    customChildSitemaps
      .map(
        (url) =>
          '  <sitemap><loc>' +
          (baseUrl + (url.startsWith('/') ? url : '/' + url)) +
          '</loc></sitemap>',
      )
      .join('\n') +
    SITEMAP_INDEX_SUFFIX;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

export async function getSitemap(
  options: GetSitemapOptions,
): Promise<Response> {
  const {
    storefront,
    request,
    params,
    getLink,
    locales = [],
    getChangeFreq,
    noItemsFallback = '/',
  } = options;

  if (!params)
    throw new Error(
      '[h2:sitemap:error] Route params object is required to generate a sitemap',
    );
  if (!request || !request.url)
    throw new Error('A request object is required to generate a sitemap');
  if (!storefront || !storefront.query)
    throw new Error('A storefront client is required to generate a index');
  if (!getLink)
    throw new Error(
      'A `getLink` function to generate each resource is required to build a sitemap',
    );

  if (!params.type || !params.page)
    throw new Response('No data found', {status: 404});

  const type = String(params.type) as SitemapIndexType;
  const query = QUERIES[type];
  if (!query) throw new Response('Not found', {status: 404});

  const data = await storefront.query<SitemapData>(query, {
    variables: {
      page: parseInt(String(params.page), 10),
    },
  });

  if (!data) {
    console.warn(
      '[h2:sitemap:warning] Sitemap is available in API version 2024-10 and later',
    );
    throw new Response('Sitemap not found.', {status: 404});
  }

  const baseUrl = new URL(request.url).origin;
  let body = '';

  const items = data?.sitemap?.resources?.items;
  if (!items?.length) {
    body =
      SITEMAP_PREFIX +
      `
  <url><loc>${baseUrl + noItemsFallback}</loc></url>
` +
      SITEMAP_SUFFIX;
  } else {
    body =
      SITEMAP_PREFIX +
      items
        .map((item) => {
          return renderUrlTag({
            getChangeFreq,
            url: getLink({
              type: item.type ?? type,
              baseUrl,
              handle: item.handle,
            }),
            type,
            getLink,
            updatedAt: item.updatedAt,
            handle: item.handle,
            metaobjectType: item.type,
            locales,
            baseUrl,
          });
        })
        .join('\n') +
      SITEMAP_SUFFIX;
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}

function getSiteMapLinks(resource: string, count: number, baseUrl: string) {
  let links = ``;
  for (let i = 1; i <= count; i++) {
    links += `  <sitemap><loc>${baseUrl}/sitemap/${resource}/${i}.xml</loc></sitemap>
`;
  }
  return links;
}

function renderUrlTag({
  url,
  updatedAt,
  locales,
  type,
  getLink,
  baseUrl,
  handle,
  getChangeFreq,
  metaobjectType,
}: {
  url: string;
  updatedAt: string;
  locales: string[];
  type: string;
  getLink: GetSitemapOptions['getLink'];
  baseUrl: string;
  handle: string;
  getChangeFreq?: GetSitemapOptions['getChangeFreq'];
  metaobjectType?: string;
}) {
  return `<url>
  <loc>${url}</loc>
  <lastmod>${updatedAt}</lastmod>
  <changefreq>${getChangeFreq ? getChangeFreq({type: metaobjectType ?? type, handle}) : 'weekly'}</changefreq>
${locales
  .map((locale) =>
    renderAlternateTag(
      getLink({type: metaobjectType ?? type, baseUrl, handle, locale}),
      locale,
    ),
  )
  .join('\n')}
</url>
  `.trim();
}

function renderAlternateTag(url: string, locale: string) {
  return `  <xhtml:link rel="alternate" hreflang="${locale}" href="${url}" />`;
}

const PRODUCT_SITEMAP_QUERY = `#graphql
    query SitemapProducts($page: Int!) {
      sitemap(type: PRODUCT) {
        resources(page: $page) {
          items {
            handle
            updatedAt
          }
        }
      }
    }
`;

const COLLECTION_SITEMAP_QUERY = `#graphql
    query SitemapCollections($page: Int!) {
      sitemap(type: COLLECTION) {
        resources(page: $page) {
          items {
            handle
            updatedAt
          }
        }
      }
    }
`;

const ARTICLE_SITEMAP_QUERY = `#graphql
    query SitemapArticles($page: Int!) {
      sitemap(type: ARTICLE) {
        resources(page: $page) {
          items {
            handle
            updatedAt
          }
        }
      }
    }
`;

const PAGE_SITEMAP_QUERY = `#graphql
    query SitemapPages($page: Int!) {
      sitemap(type: PAGE) {
        resources(page: $page) {
          items {
            handle
            updatedAt
          }
        }
      }
    }
`;

const BLOG_SITEMAP_QUERY = `#graphql
    query SitemapBlogs($page: Int!) {
      sitemap(type: BLOG) {
        resources(page: $page) {
          items {
            handle
            updatedAt
          }
        }
      }
    }
`;

const METAOBJECT_SITEMAP_QUERY = `#graphql
    query SitemapMetaobjects($page: Int!) {
      sitemap(type: METAOBJECT) {
        resources(page: $page) {
          items {
            handle
            updatedAt
            ... on SitemapResourceMetaobject {
              type
            }
          }
        }
      }
    }
`;

const SITEMAP_INDEX_QUERY = `#graphql
query SitemapIndex {
  products: sitemap(type: PRODUCT) {
    pagesCount {
      count
    }
  }
  collections: sitemap(type: COLLECTION) {
    pagesCount {
      count
    }
  }
  articles: sitemap(type: ARTICLE) {
    pagesCount {
      count
    }
  }
  pages: sitemap(type: PAGE) {
    pagesCount {
      count
    }
  }
  blogs: sitemap(type: BLOG) {
    pagesCount {
      count
    }
  }
  metaObjects: sitemap(type: METAOBJECT) {
    pagesCount {
      count
    }
  }
}
`;

const QUERIES: Record<SitemapIndexType, string> = {
  products: PRODUCT_SITEMAP_QUERY,
  articles: ARTICLE_SITEMAP_QUERY,
  collections: COLLECTION_SITEMAP_QUERY,
  pages: PAGE_SITEMAP_QUERY,
  blogs: BLOG_SITEMAP_QUERY,
  metaObjects: METAOBJECT_SITEMAP_QUERY,
};

/** Sitemap types generated from Shopify's sitemap API (then filtered by Pack). */
export const SHOPIFY_TEMPLATE_TYPES = ['products', 'collections'];
/** Sitemap types generated from Pack's own content. */
export const PACK_NATIVE_TEMPLATE_TYPES = ['pages', 'blogs', 'articles'];
