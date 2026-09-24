/**
 * Next.js `Metadata` port of the old `@shopify/hydrogen` (2026.4)
 * `getSeoMeta`. Server-safe.
 */
import type {Metadata} from 'next';
import type {Thing, WithContext} from 'schema-dts';

type Maybe<T> = T | null;

export type SeoMedia = {
  /** Used to generate og:<type of media> meta tags. */
  type: 'image' | 'video' | 'audio';
  /** Populates url + secure_url; also used to infer the mime type. */
  url: Maybe<string> | undefined;
  height: Maybe<number> | undefined;
  width: Maybe<number> | undefined;
  altText: Maybe<string> | undefined;
};

export interface LanguageAlternate {
  /** hreflang language code. */
  language: string;
  /** Adds the `-default` suffix to the hreflang (old Hydrogen behaviour). */
  default?: boolean;
  url: string;
}

export interface RobotsOptions {
  maxImagePreview?: 'none' | 'standard' | 'large';
  maxSnippet?: number;
  maxVideoPreview?: number;
  noArchive?: boolean;
  noFollow?: boolean;
  noImageIndex?: boolean;
  noIndex?: boolean;
  noSnippet?: boolean;
  noTranslate?: boolean;
  unavailableAfter?: string;
}

/** Old Hydrogen `SeoConfig`. */
export interface SeoConfig {
  title?: Maybe<string>;
  /** Template with a `%s` placeholder for the title. */
  titleTemplate?: Maybe<string> | null;
  media?:
    Maybe<string> | Partial<SeoMedia> | (Partial<SeoMedia> | Maybe<string>)[];
  description?: Maybe<string>;
  /** Canonical URL (query string and trailing slash are stripped). */
  url?: Maybe<string>;
  /** Twitter handle (`@shop`) for twitter:site / twitter:creator. */
  handle?: Maybe<string>;
  jsonLd?: WithContext<Thing> | WithContext<Thing>[];
  alternates?: LanguageAlternate | LanguageAlternate[];
  robots?: RobotsOptions;
}

type Optional<T> = T | null | undefined;

function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Merge SEO configs exactly like old `getSeoMeta`: falsy values are dropped,
 * later configs override earlier ones key by key, and `jsonLd` entries are
 * concatenated so each route keeps its own structured data.
 */
export function mergeSeoConfigs(
  ...seoInputs: Optional<SeoConfig>[]
): SeoConfig {
  return seoInputs.reduce<SeoConfig>((acc, input) => {
    if (!input) return acc;
    const current = Object.fromEntries(
      Object.entries(input).filter(([, value]) => !!value),
    ) as SeoConfig;
    const {jsonLd} = current;
    if (!jsonLd) return {...acc, ...current};
    if (!acc?.jsonLd) return {...acc, ...current, jsonLd: [jsonLd].flat()};
    return {
      ...acc,
      ...current,
      jsonLd: ensureArray(acc.jsonLd).concat(jsonLd),
    };
  }, {});
}

/** Merged, non-empty jsonLd blocks (what `<JsonLd>` renders). */
export function getSeoJsonLd(
  ...seoInputs: Optional<SeoConfig>[]
): WithContext<Thing>[] {
  const {jsonLd} = mergeSeoConfigs(...seoInputs);
  if (!jsonLd) return [];
  return ensureArray(jsonLd).filter(
    (block) =>
      !!block && typeof block === 'object' && Object.keys(block).length > 0,
  );
}

function renderTitle(template: Optional<string>, title: Optional<string>) {
  if (!title) return undefined;
  if (!template) return title;
  return template.replace('%s', title ?? '');
}

function inferMimeType(url: Optional<string>) {
  const ext = url && url.split('.').pop();
  switch (ext) {
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'swf':
      return 'application/x-shockwave-flash';
    case 'mp3':
      return 'audio/mpeg';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

type OgMedia = {
  url: string;
  secureUrl?: string;
  type?: string;
  width?: number;
  height?: number;
  alt?: string;
};

function robotsToString(robots: RobotsOptions) {
  const {
    maxImagePreview,
    maxSnippet,
    maxVideoPreview,
    noArchive,
    noFollow,
    noImageIndex,
    noIndex,
    noSnippet,
    noTranslate,
    unavailableAfter,
  } = robots;
  const params = [
    noArchive && 'noarchive',
    noImageIndex && 'noimageindex',
    noSnippet && 'nosnippet',
    noTranslate && 'notranslate',
    maxImagePreview && `max-image-preview:${maxImagePreview}`,
    maxSnippet && `max-snippet:${maxSnippet}`,
    maxVideoPreview && `max-video-preview:${maxVideoPreview}`,
    unavailableAfter && `unavailable_after:${unavailableAfter}`,
  ];
  let value =
    (noIndex ? 'noindex' : 'index') + ',' + (noFollow ? 'nofollow' : 'follow');
  for (const param of params) {
    if (param) value += `,${param}`;
  }
  return value;
}

/**
 * Build Next `Metadata` from one or more SEO configs (root first, route
 * last), equivalent to old `getSeoMeta(...seoConfigs)`:
 *
 * - `title` (+ `titleTemplate`) → `title` (absolute), `og:title`, `twitter:title`
 * - `description` → description, og/twitter description
 * - `url` → `alternates.canonical` + `og:url` (no query, no trailing slash)
 * - `handle` → `twitter:site` / `twitter:creator`
 * - `media` → `og:image|video|audio` (+ twitter images for images)
 * - `robots` → `<meta name="robots">` with the same content string
 * - `alternates` → `alternates.languages` (hreflang → url)
 *
 * `jsonLd` is not part of `Metadata`; render it with `<JsonLd seo={[...]}/>`.
 *
 * Note that Next shallow-merges page metadata over layout metadata, so a
 * page should pass the root/site SEO config along with its own.
 */
export function getSeoMetadata(...seoConfigs: Optional<SeoConfig>[]): Metadata {
  const seo = mergeSeoConfigs(...seoConfigs);
  const metadata: Metadata = {};
  const openGraph: Record<string, any> = {};
  const twitter: Record<string, any> = {};
  const alternates: NonNullable<Metadata['alternates']> = {};

  const title = renderTitle(seo.titleTemplate, seo.title);
  if (title) {
    metadata.title = {absolute: title};
    openGraph.title = title;
    twitter.title = title;
  }

  if (seo.description) {
    metadata.description = seo.description;
    openGraph.description = seo.description;
    twitter.description = seo.description;
  }

  if (seo.url && typeof seo.url === 'string') {
    const url = seo.url.split('?')[0].replace(/\/$/, '');
    alternates.canonical = url;
    openGraph.url = url;
  }

  if (seo.handle) {
    twitter.site = seo.handle;
    twitter.creator = seo.handle;
  }

  if (seo.media) {
    const images: OgMedia[] = [];
    const videos: OgMedia[] = [];
    const audio: OgMedia[] = [];
    for (const media of ensureArray(seo.media)) {
      if (!media) continue;
      if (typeof media === 'string') {
        images.push({url: media});
        continue;
      }
      if (typeof media !== 'object' || !media.url) continue;
      const entry: OgMedia = {
        url: media.url,
        secureUrl: media.url,
        type: inferMimeType(media.url),
        ...(media.width ? {width: media.width} : {}),
        ...(media.height ? {height: media.height} : {}),
        ...(media.altText ? {alt: media.altText} : {}),
      };
      const type = media.type || 'image';
      if (type === 'video') videos.push(entry);
      else if (type === 'audio') audio.push(entry);
      else images.push(entry);
    }
    if (images.length) {
      openGraph.images = images;
      twitter.images = images.map(({url, alt}) => (alt ? {url, alt} : {url}));
    }
    if (videos.length) openGraph.videos = videos;
    if (audio.length) openGraph.audio = audio;
  }

  if (seo.alternates) {
    const languages: Record<string, string> = {};
    for (const alternate of ensureArray(seo.alternates)) {
      if (!alternate?.url || !alternate.language) continue;
      const hrefLang = `${alternate.language}${alternate.default ? '-default' : ''}`;
      languages[hrefLang] = alternate.url;
    }
    if (Object.keys(languages).length) alternates.languages = languages;
  }

  if (seo.robots) {
    metadata.robots = robotsToString(seo.robots);
  }

  if (Object.keys(openGraph).length) metadata.openGraph = openGraph;
  if (Object.keys(twitter).length) metadata.twitter = twitter;
  if (Object.keys(alternates).length) metadata.alternates = alternates;

  return metadata;
}
