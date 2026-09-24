'use client';

import {serialize} from 'cookie';
import {useEffect} from 'react';

import {PACK_COOKIE_MAX_AGE, PACK_USER_CONSENT_COOKIE_ID} from '../constants';

export type UsePackCookiesOptions = {
  /**
   * If set to `false`, the Pack session id is regenerated on every request
   * (nothing persistent identifies the visitor). Defaults to true.
   **/
  hasUserConsent?: boolean;
  /**
   * The domain scope of the cookie. Defaults to empty string.
   **/
  domain?: string;
};

/** Mirrors the visitor's tracking consent into the `__pack_user_consent` cookie. */
export function usePackCookies(options?: UsePackCookiesOptions): void {
  const {hasUserConsent = true, domain = ''} = options || {};

  useEffect(() => {
    setCookie(
      PACK_USER_CONSENT_COOKIE_ID,
      hasUserConsent ? 'true' : 'false',
      PACK_COOKIE_MAX_AGE,
      domain,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUserConsent]);
}

function setCookie(
  name: string,
  value: string,
  maxAge: number,
  domain: string,
) {
  document.cookie = serialize(name, value, {
    maxAge,
    // `cookie` rejects an empty domain; omit it to scope to the current host
    domain: domain || undefined,
    sameSite: 'lax',
    path: '/',
  });
}
