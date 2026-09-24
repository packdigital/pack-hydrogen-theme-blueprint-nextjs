/**
 * Buyer geolocation. On Oxygen this came from `oxygen-buyer-*` headers; on
 * Vercel it comes from the `x-vercel-ip-*` headers. Oxygen headers are still
 * read as a fallback. The `OxygenEnv` name is kept so existing
 * `context.oxygen.buyer` call sites are unchanged.
 */

export type OxygenEnv = {
  buyer: {
    readonly ip: string | undefined;
    readonly country: string | undefined;
    readonly continent: string | undefined;
    readonly city: string | undefined;
    readonly isEuCountry: boolean;
    readonly latitude: string | undefined;
    readonly longitude: string | undefined;
    readonly region: string | undefined;
    readonly regionCode: string | undefined;
    readonly timezone: string | undefined;
  };
};

const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

const decode = (value: string | null) => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function getOxygenEnv(request: {headers: Headers}): OxygenEnv {
  const {headers} = request;
  const header = (vercel: string, oxygen: string) =>
    decode(headers.get(vercel)) ?? decode(headers.get(oxygen));

  const country = header('x-vercel-ip-country', 'oxygen-buyer-country');
  const oxygenIsEu = headers.get('oxygen-buyer-is-eu-country');

  return Object.freeze({
    buyer: {
      ip:
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        headers.get('oxygen-buyer-ip') ||
        undefined,
      country,
      continent: header('x-vercel-ip-continent', 'oxygen-buyer-continent'),
      city: header('x-vercel-ip-city', 'oxygen-buyer-city'),
      isEuCountry: oxygenIsEu
        ? Boolean(oxygenIsEu)
        : Boolean(country && EU_COUNTRIES.has(country.toUpperCase())),
      latitude: header('x-vercel-ip-latitude', 'oxygen-buyer-latitude'),
      longitude: header('x-vercel-ip-longitude', 'oxygen-buyer-longitude'),
      region: header('x-vercel-ip-country-region', 'oxygen-buyer-region'),
      regionCode: header(
        'x-vercel-ip-country-region',
        'oxygen-buyer-region-code',
      ),
      timezone: header('x-vercel-ip-timezone', 'oxygen-buyer-timezone'),
    },
  });
}
