import type {ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';

import {Document} from '~/components/Document';
import {PlaybookSDK} from '~/components/Document/PlaybookSDK';
import {ShopifyScripts} from '~/lib/analytics/ShopifyScripts';
import {RouteDataProvider} from '~/lib/router';
import {buildRouteMetadata} from '~/lib/server/metadata';
import {rootLoader} from '~/lib/server/root-loader';
import {runLoader} from '~/lib/server/route';
import {routeTemplates} from '~/lib/server/route-templates';
import '~/styles/app.css';

/**
 * Root layout (formerly `app/root.tsx` + `Document`). Every storefront URL is
 * rewritten by the proxy into this `[locale]` segment — `default` for
 * unprefixed URLs — so this is the document for the whole storefront.
 */

/**
 * `instant = false` opts the storefront out of Cache Components'
 * instant-navigation and static-shell validation. It does not change
 * rendering. This layout and every page read per-request state (Pack session
 * and A/B test cookies, customer session, cart, buyer locale) at the top of
 * the tree, so they would fail both checks: a full page load has no static
 * shell, and client navigations prefetch only `loading.tsx`. Data is cached
 * below the page with 'use cache: remote'. Moving per-request reads below
 * <Suspense> would let cached page content into the shell.
 */
export const instant = false;

/**
 * `locale` is a root param, which Cache Components requires at least one
 * value for. `default` is the segment unprefixed URLs are rewritten to; other
 * locale prefixes are rendered on request.
 */
export function generateStaticParams() {
  return [{locale: 'default'}];
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const root = await runLoader(rootLoader);
  const favicon =
    root.siteSettings?.data?.siteSettings?.favicon || '/favicon.svg';
  const pathname = favicon.split('?')[0].toLowerCase();
  const supportsAppleTouchIcon = /\.(png|jpe?g)$/.test(pathname);
  return {
    ...(await buildRouteMetadata()),
    icons: {
      icon: favicon,
      ...(supportsAppleTouchIcon
        ? {apple: [{url: favicon, sizes: '180x180'}]}
        : null),
    },
  };
}

export default async function RootLayout({children}: {children: ReactNode}) {
  const root = await runLoader(rootLoader);
  const {language} = root.selectedLocale;

  return (
    <html lang={language.toLowerCase()}>
      <head>
        <link rel="preconnect" href="https://cdn.shopify.com" />
        <link rel="preconnect" href="https://shop.app" />
        <PlaybookSDK
          ENV={root.ENV}
          hasPlaybookParams={root.hasPlaybookParams}
        />
        <ShopifyScripts
          shop={root.shopifyScripts.shop}
          i18n={root.shopifyScripts.i18n}
          routes={routeTemplates}
        />
      </head>
      <body>
        <RouteDataProvider id="root" data={root}>
          <Document>{children}</Document>
        </RouteDataProvider>
      </body>
    </html>
  );
}
