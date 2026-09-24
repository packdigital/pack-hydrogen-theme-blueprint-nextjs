'use client';

import {RenderSections} from '@pack/react';

import {useLoaderData} from '~/lib/router';
import type {Page} from '~/lib/types';
import type {PageLoaderData} from '~/app/[locale]/pages/[handle]/page';

export default function PageRoute() {
  const {page} = useLoaderData<Omit<PageLoaderData, 'page'> & {page: Page}>();

  return (
    <div data-comp="PageRoute">
      <RenderSections content={page} />
    </div>
  );
}
