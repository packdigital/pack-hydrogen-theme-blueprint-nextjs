import 'server-only';

import {getBuyerIp} from '~/lib/server/storefront';

import type {Pack} from '../create-pack-client';
import type {PackSession} from '../session';

import {getClientLocales} from './utils/get-client-locales';
import {getDevice} from './utils/get-client-device';
import {getClientLocation} from './utils/get-client-location';
import {getPacklyticsId} from './utils/get-packlytics-id';
import {trackPageHit} from './utils/send-event';

/**
 * Port of `@pack/packlytics` (page-hit analytics posted by `@pack/react` to
 * `*\/pack/track`), without the `@shopify/hydrogen/oxygen` dependency.
 */

type PacklyticsPayload = {
  userAgent?: string;
  pathname?: string;
  query?: string;
  screen?: string;
  referrer?: string;
  hostname?: string;
  userTimeZone?: string;
  language?: string;
  locale?: string;
  connection?: string;
  deviceCategory?: string;
  href?: string;
};

export async function sendEvent(
  request: Request,
  session: PackSession,
  params: {storefrontId: string; sessionSecret: string},
) {
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  // Preview enabled
  if (session.get('previewEnabled')) {
    return;
  }

  const payload = (await request.json()) as PacklyticsPayload;
  const url = new URL(request.url);
  const ipaddress = getBuyerIp(request.headers) || '';

  const dataToHash = `${request.headers.get('user-agent')}${ipaddress}${url.hostname}`;
  const packlyticsId = getPacklyticsId(dataToHash, params.sessionSecret);
  const locale = getClientLocales(request.headers) || ['en-US'];
  const location = getClientLocation(payload.locale || locale[0]);

  return trackPageHit(
    params.storefrontId,
    packlyticsId,
  )({
    'pack-session-id': session.id, // This session ID is saved on the __pack cookie
    'user-agent': payload.userAgent || request.headers.get('user-agent') || '',
    pathname: payload.pathname,
    query: payload.query,
    screen: payload.screen,
    referrer: payload.referrer,
    hostname: payload.hostname,
    ipaddress,
    userTimeZone: payload.userTimeZone,
    language: payload.language || getClientLocales(request.headers) || '',
    locale: payload.locale || locale[0],
    location,
    connection: payload.connection || request.headers.get('connection') || '',
    deviceCategory: payload.deviceCategory || '',
    href: payload.href || request.url,
    ...getDevice(request.headers.get('user-agent') || ''),
  });
}

/** `POST .../pack/track` — the Packlytics beacon endpoint. */
export function isPacklyticsTrackRequest(request: {
  method: string;
  url: string;
}) {
  return (
    request.method === 'POST' &&
    new URL(request.url).pathname.endsWith('/pack/track')
  );
}

/**
 * Handles the Packlytics beacon. Always answers `{"response":"ok"}`; errors
 * are swallowed. Does not set cookies: run `commitPackSessions` (and
 * `clearExposedTestCookie`) on the returned response as for any other.
 */
export async function handlePacklyticsTrack(
  request: Request,
  pack: Pack,
): Promise<Response> {
  try {
    await sendEvent(request, pack.session, {
      storefrontId: pack.getPackSessionData().storeId,
      sessionSecret: pack.session.secret,
    });
  } catch {
    // Analytics must never break the storefront
  }
  return new Response(JSON.stringify({response: 'ok'}));
}
