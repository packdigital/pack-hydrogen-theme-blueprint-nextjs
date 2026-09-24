import type {Order as OrderType} from '@shopify/hydrogen/customer-account-api-types';

import {AnalyticsPageType} from '~/lib/analytics/shop';
import {getAccountSeo} from '~/lib/server-utils/seo.server';
import {CUSTOMER_ORDER_QUERY} from '~/data/graphql/customer-account/customer';
import {getAccountData} from '~/lib/customer/account.server';
import {RouteDataProvider} from '~/lib/router';
import {routeMetadata} from '~/lib/server/metadata';
import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';
import OrderRoute from '~/routes/($locale).account.orders.$id';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string; id: string};

async function loader({request, context, params}: LoaderArgs<Params>) {
  if (!params.id) {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: params.locale ? `/${params.locale}/account` : '/account',
      },
    });
  }

  // Sign-in gate and token refresh redirect from the account layout, before
  // the order query (whose failures below become a 404)
  await getAccountData(params);

  const queryParams = new URL(request.url).searchParams;
  const orderToken = queryParams.get('key');

  try {
    const orderId = orderToken
      ? `gid://shopify/Order/${params.id}?key=${orderToken}`
      : `gid://shopify/Order/${params.id}`;

    const {data, errors} = await context.customerAccount.query(
      CUSTOMER_ORDER_QUERY,
      {variables: {orderId}},
    );

    if (errors?.length || !data?.order || !data?.order?.lineItems) {
      throw new Error('order information');
    }

    const order: OrderType = data.order;

    const analytics = {pageType: AnalyticsPageType.customersOrder};
    const seo = await getAccountSeo(context, 'Order');

    return {analytics, order, seo};
  } catch (error) {
    // e.g. a redirect to `/account/refresh` when the access token expired
    if (error instanceof Response) throw error;
    throw new Response(error instanceof Error ? error.message : undefined, {
      status: 404,
    });
  }
}

export type OrderLoaderData = Awaited<ReturnType<typeof loader>>;

export const generateMetadata = routeMetadata(loader);

export default async function OrderPage({params}: {params: Promise<Params>}) {
  const data = await runLoader(loader, await params);
  return (
    <RouteDataProvider id="routes/($locale).account.orders.$id" data={data}>
      <OrderRoute />
    </RouteDataProvider>
  );
}
