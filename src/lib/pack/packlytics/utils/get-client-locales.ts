import {parseAcceptLanguage} from 'intl-parse-accept-language';

export function getClientLocales(headers: Headers): string[] | undefined {
  const acceptLanguage = headers.get('Accept-Language');
  // if the header is not defined, return undefined
  if (!acceptLanguage) return undefined;

  const locales = parseAcceptLanguage(acceptLanguage, {
    validate: Intl.DateTimeFormat.supportedLocalesOf,
    ignoreWildcard: true,
  });

  // if there are no locales found, return undefined
  if (locales.length === 0) return undefined;

  return locales;
}
