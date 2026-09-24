'use client';

import {RenderSections} from '@pack/react';

import {useLoaderData} from '~/lib/router';
import type {BlogLoaderData} from '~/app/[locale]/blogs/[blogHandle]/page';

export default function BlogRoute() {
  const {blog} = useLoaderData<BlogLoaderData>();

  return (
    <div data-comp="BlogRoute">
      <RenderSections content={blog} />
    </div>
  );
}
