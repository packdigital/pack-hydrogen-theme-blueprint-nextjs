import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getAccountSeo} from '~/lib/server-utils/seo.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';
import OrdersRoute from '~/routes/($locale).account.orders._index';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string};

async function loader({context}: LoaderArgs<Params>) {
  const analytics = {pageType: AnalyticsPageType.customersAccount};
  const seo = await getAccountSeo(context, 'Orders');
  return {analytics, seo};
}

export const generateMetadata = routeMetadata(loader);

export default async function OrdersPage({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).account.orders._index" data={data}>
      <OrdersRoute />
    </RouteDataProvider>
  );
}
