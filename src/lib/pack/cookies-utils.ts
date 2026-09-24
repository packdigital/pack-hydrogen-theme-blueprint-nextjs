import 'server-only';
import * as cookie from 'cookie';

import {PACK_USER_CONSENT_COOKIE_ID} from './constants';
import type {PackRequestHeaders} from './types';

const tokenHash = 'xxxx-4xxx-xxxx-xxxxxxxxxxxx';

export function isSafari(userAgent: string | null): boolean {
  if (!userAgent) return false;

  // Check for iOS devices (iPhone/iPad) or macOS Safari
  return (
    /Safari\//.test(userAgent) &&
    !/Chrome\//.test(userAgent) &&
    !/Chromium\//.test(userAgent) &&
    !/Edg\//.test(userAgent) &&
    !/Firefox\//.test(userAgent)
  );
}

/** Safari refuses `Secure` cookies on http://localhost, so relax it in dev only. */
export function isSecureCookie(request: PackRequestHeaders) {
  return !(
    isSafari(request.headers.get('User-Agent')) &&
    process.env.NODE_ENV === 'development'
  );
}

export function hasUserConsent(request: PackRequestHeaders) {
  const cookies = cookie.parse(request.headers.get('Cookie') || '');

  return cookies[PACK_USER_CONSENT_COOKIE_ID]
    ? cookies[PACK_USER_CONSENT_COOKIE_ID] === 'true'
    : true;
}

/**
 * This will generate a random UUID
 * This is not based on user data,
 * This is based on a random number generator using crypto or math.random
 *
 * This UUID is used to generate a session ID for the session cookie
 *
 * We can never use this id to trace back users for GDPR compliance.
 */
export function buildRandomUUID(): string {
  let hash = '';

  try {
    const randomValuesArray = new Uint16Array(31);
    globalThis.crypto.getRandomValues(randomValuesArray);

    // Generate a strong UUID
    let i = 0;
    hash = tokenHash.replace(/[x]/g, (c: string): string => {
      const r = randomValuesArray[i] % 16;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      i++;
      return v.toString(16);
    });
  } catch {
    // crypto not available, generate weak UUID
    hash = tokenHash.replace(/[x]/g, (c: string): string => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return `${hexTime()}-${hash}`;
}

function hexTime(): string {
  // 32 bit representations of new Date().getTime() and performance.now()
  let perfNumber = 0;

  // Result of zero-fill right shift is always positive
  const dateNumber = new Date().getTime() >>> 0;

  try {
    perfNumber = performance.now() >>> 0;
  } catch {
    perfNumber = 0;
  }

  const output = Math.abs(dateNumber + perfNumber)
    .toString(16)
    .toLowerCase();

  // Ensure the output is exactly 8 characters
  return output?.substring(0, 8).padStart(8, '0');
}
