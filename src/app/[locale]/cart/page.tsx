import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getShop, getSiteSettings} from '~/lib/server-utils/settings.server';
import {seoPayload} from '~/lib/server-utils/seo.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs, LoaderData} from '~/lib/server/route';
import {JsonLd} from '~/lib/seo/JsonLd';
import type {Page} from '~/lib/types';
import CartRoute from '~/routes/($locale).cart';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale?: string};

async function loader({context, request}: LoaderArgs<Params>) {
  const [shop, siteSettings] = await Promise.all([
    getShop(context),
    getSiteSettings(context),
  ]);
  const analytics = {pageType: AnalyticsPageType.cart};
  const seo = seoPayload.page({
    page: {title: 'Cart'} as Page,
    shop,
    siteSettings,
  });
  return {analytics, seo, url: request.url};
}

export type CartLoaderData = LoaderData<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function CartPageRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).cart" data={data}>
      <JsonLd seo={[data.seo]} />
      <CartRoute />
    </RouteDataProvider>
  );
}
