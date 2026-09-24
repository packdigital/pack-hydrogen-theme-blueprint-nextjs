'use client';

import type {Collection as CollectionType} from '@shopify/hydrogen/storefront-api-types';

import {Analytics} from '~/lib/analytics';
import {useLoaderData} from '~/lib/router';
import {Collection} from '~/components/Collection';
import {useGlobal} from '~/hooks';
import type {ActiveFilterValue} from '~/components/Collection/CollectionFilters/CollectionFilters.types';
import type {SearchLoaderData} from '~/app/[locale]/search/page';

export default function SearchRoute() {
  const {activeFilterValues, collection, searchTerm} =
    useLoaderData<SearchLoaderData>();
  const {isCartReady} = useGlobal();

  return (
    <section data-comp="search-page" className="[&_h1]:text-h3">
      <Collection
        activeFilterValues={activeFilterValues as ActiveFilterValue[]}
        collection={collection as CollectionType}
        searchTerm={searchTerm}
        showHeading
        title={collection.title}
      />

      {isCartReady && (
        <Analytics.SearchView
          data={{
            searchTerm,
            searchResults: collection.products.nodes,
          }}
        />
      )}
    </section>
  );
}
