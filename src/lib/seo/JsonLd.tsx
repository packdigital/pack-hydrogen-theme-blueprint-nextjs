import {getSeoJsonLd} from './metadata';
import type {SeoConfig} from './metadata';

/**
 * Renders the merged `jsonLd` blocks of one or more SEO configs as
 * `<script type="application/ld+json">` tags (old `getSeoMeta` emitted these
 * as `script:ld+json` meta descriptors). Server component.
 *
 * @example <JsonLd seo={[rootSeo, pageSeo]} />
 */
export function JsonLd({
  seo,
}: {
  seo: Array<SeoConfig | Record<string, any> | null | undefined>;
}) {
  const blocks = getSeoJsonLd(...(seo as Array<SeoConfig | null | undefined>));
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((block, index) => {
        const type = (block as unknown as Record<string, unknown>)['@type'];
        return (
          <script
            key={`json-ld-${typeof type === 'string' ? type : 'thing'}-${index}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(block).replace(/</g, '\\u003c'),
            }}
          />
        );
      })}
    </>
  );
}
