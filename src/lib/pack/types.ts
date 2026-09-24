/**
 * Types shared by the Pack server modules and client hooks. Kept free of
 * runtime code so client components can import them.
 */

export interface TestInput {
  testId?: string;
  testHandle?: string;
  testVariantId?: string;
  testVariantHandle?: string;
}

export interface Test {
  id: string;
  handle: string;
  impressionTrigger?: string;
  testVariant: {
    id: string;
    handle: string;
  };
  impression?: {
    sectionIds?: string[];
  };
}

export interface TestInfo extends Test {
  isFirstExposure?: boolean;
}

export interface TestTargetAudienceAttributes {
  url?: string;
  query?: string;
  path?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
}

export interface PackCustomizerMeta {
  environment?: string;
  overlay?: {
    src?: string;
    version?: string;
  };
  previewContext?: {
    locale?: string;
    pageDraft?: string;
    siteSettingsDraft?: string;
    testHandle?: string;
    testVariantHandle?: string;
  };
  [key: string]: any;
}

/** Anything with the request headers (a `Request`, or `{headers}` built from `headers()`). */
export type PackRequestHeaders = {headers: Headers};

/** Request-like input with a URL, for query-param test overrides and targeting. */
export type PackRequestLike = {url: string; headers: Headers};
