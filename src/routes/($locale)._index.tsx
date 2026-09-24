'use client';

import {RenderSections} from '@pack/react';

import {useLoaderData} from '~/lib/router';
import type {IndexLoaderData} from '~/app/[locale]/page';

export default function Index() {
  const {page} = useLoaderData<IndexLoaderData>();

  return <RenderSections content={page} />;
}
