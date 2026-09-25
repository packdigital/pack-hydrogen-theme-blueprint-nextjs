import {ProductItemSkeleton} from '~/components/ProductItem';

/**
 * Loading UI for every storefront page. It is static, so it goes into the
 * prefetch: navigations swap to it immediately (header and footer stay in
 * place) while the page renders on the server.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading</span>

      <div className="h-[40vh] w-full animate-pulse bg-neutralLightest md:h-[50vh]" />

      <div className="px-contained py-contained">
        <div className="mb-6 h-8 w-64 max-w-full animate-pulse bg-neutralLightest" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <ProductItemSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
