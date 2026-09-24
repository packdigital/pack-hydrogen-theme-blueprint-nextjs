import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getAccountSeo} from '~/lib/server-utils/seo.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';
import AddressesRoute from '~/routes/($locale).account.addresses';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string};

async function loader({context}: LoaderArgs<Params>) {
  const analytics = {pageType: AnalyticsPageType.customersAddresses};
  const seo = await getAccountSeo(context, 'Addresses');
  return {analytics, seo};
}

export const generateMetadata = routeMetadata(loader);

export default async function AddressesPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).account.addresses" data={data}>
      <AddressesRoute />
    </RouteDataProvider>
  );
}
