'use client';

import {RenderSections} from '@pack/react';

import {useLoaderData} from '~/lib/router';
import type {BlogArticleLoaderData} from '~/app/[locale]/blogs/[blogHandle]/[handle]/page';

export default function ArticleRoute() {
  const {article} = useLoaderData<BlogArticleLoaderData>();

  const atDate =
    article.firstPublishedAt || article.publishedAt || article.createdAt;
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  } as Intl.DateTimeFormatOptions;
  const date = new Date(atDate).toLocaleDateString('en-US', options);

  return (
    <div className="py-contained" data-comp="ArticleRoute">
      <section
        className="px-contained mb-8 flex flex-col items-center gap-3 text-center md:mb-10"
        data-comp="article-header"
      >
        <p className="text-sm md:text-base">
          {article.author ? `${article.author} | ` : ''}
          {date}
        </p>

        <h1 className="text-h2 max-w-[60rem]">{article.title}</h1>

        {article.category && (
          <p className="btn-text flex h-8 items-center justify-center rounded-full bg-neutralLighter px-4 text-text">
            {article.category}
          </p>
        )}
      </section>

      <RenderSections content={article} />
    </div>
  );
}
