import 'server-only';

import type {Metadata} from 'next';

import {getSeoMetadata} from '~/lib/seo/metadata';
import type {SeoConfig} from '~/lib/seo/metadata';

import {rootLoader} from './root-loader';
import {runLoader} from './route';
import type {LoaderData, RouteParams} from './route';

/**
 * Next metadata for a route: the root SEO payload merged with the route's
 * `seo` (what `getSeoMeta(...matches.map(m => m.loaderData.seo))` did), plus
 * the document-level tags `Document.tsx` used to render (keywords,
 * og:site_name, og:locale, canonical from `PRIMARY_DOMAIN`).
 */
export async function buildRouteMetadata(
  ...routeSeo: Array<SeoConfig | Record<string, any> | null | undefined>
): Promise<Metadata> {
  const root = await runLoader(rootLoader);
  const metadata = getSeoMetadata(
    root.seo as SeoConfig,
    ...(routeSeo as SeoConfig[]),
  );

  const keywords = root.siteSettings?.data?.siteSettings?.seo?.keywords;
  const {language, country} = root.selectedLocale;

  let canonical: string | undefined;
  try {
    const primaryUrl = new URL(root.ENV.PRIMARY_DOMAIN);
    const routeUrl = new URL(root.url);
    canonical = `${primaryUrl.origin}${
      routeUrl.pathname === '/' ? '' : routeUrl.pathname
    }`;
  } catch {
    canonical = undefined;
  }

  return {
    ...metadata,
    keywords: keywords?.length ? keywords.join(', ') : metadata.keywords,
    alternates: {
      ...metadata.alternates,
      // Document.tsx rendered the canonical on PRIMARY_DOMAIN; prefer it.
      canonical: canonical ?? metadata.alternates?.canonical,
    },
    openGraph: {
      type: 'website',
      siteName: root.siteTitle,
      locale: `${language.toLowerCase()}_${country.toUpperCase()}`,
      ...(metadata.openGraph as object),
    },
  };
}

/** `generateMetadata` for a page whose loader returns `{seo}`. */
export function routeMetadata<Params extends RouteParams>(
  loader: Parameters<typeof runLoader<Params, any>>[0],
) {
  return async ({params}: {params: Promise<Params>}): Promise<Metadata> => {
    const data = (await runLoader(loader, await params)) as LoaderData<{
      seo?: SeoConfig;
    }>;
    return buildRouteMetadata(data?.seo);
  };
}
