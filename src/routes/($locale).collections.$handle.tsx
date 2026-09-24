'use client';

import {RenderSections} from '@pack/react';
import type {Collection as CollectionType} from '@shopify/hydrogen/storefront-api-types';

import {Analytics} from '~/lib/analytics';
import {useLoaderData} from '~/lib/router';
import {Collection} from '~/components/Collection';
import {useGlobal} from '~/hooks';
import type {Page} from '~/lib/types';
import type {ActiveFilterValue} from '~/components/Collection/CollectionFilters/CollectionFilters.types';
import type {CollectionLoaderData} from '~/app/[locale]/collections/[handle]/page';

export default function CollectionRoute() {
  const {activeFilterValues, collection, collectionPage} = useLoaderData<
    Omit<
      CollectionLoaderData,
      'activeFilterValues' | 'collection' | 'collectionPage'
    > & {
      activeFilterValues: ActiveFilterValue[];
      collection: CollectionType;
      collectionPage?: Page;
    }
  >();
  const {isCartReady} = useGlobal();

  // determines if default collection heading should be shown
  // logic will apply once the hero section is saved and page is refreshed
  const HERO_KEYS = ['hero', 'banner'];
  const hasVisibleHeroSection = !collectionPage
    ? false
    : collectionPage.sections.nodes.some(({data}: any) => {
        return HERO_KEYS.includes(data?._template);
      });

  return (
    <div data-comp="CollectionRoute">
      {collectionPage && <RenderSections content={collectionPage} />}

      <section data-comp="collection">
        <Collection
          activeFilterValues={activeFilterValues as ActiveFilterValue[]}
          collection={collection}
          showHeading={!hasVisibleHeroSection}
          title={collectionPage?.title}
        />
      </section>

      {isCartReady && (
        <Analytics.CollectionView
          data={{
            collection: {
              id: collection.id,
              handle: collection.handle,
            },
          }}
          customData={{collection}}
        />
      )}
    </div>
  );
}
