import 'server-only';

import {PACK_TEST_INFO_HEADER} from './constants';
import type {TestInfo} from './types';

/**
 * Proxy -> render hand-off for the A/B test the proxy resolved.
 *
 * The value is `encodeURIComponent(JSON.stringify(testInfo ?? null))`, so it
 * stays header-safe whatever the test handles contain. `null` means "resolved,
 * no test"; a missing header means "not resolved" (the render then falls back
 * to resolving itself, without being able to persist the assignment).
 */

/**
 * Always call this in the proxy (even with `undefined`): it overwrites any
 * client-sent header of the same name, so the value can be trusted.
 */
export function setResolvedTestInfoHeader(
  requestHeaders: Headers,
  testInfo: TestInfo | null | undefined,
) {
  requestHeaders.set(
    PACK_TEST_INFO_HEADER,
    encodeURIComponent(JSON.stringify(testInfo ?? null)),
  );
}

/** Reads the header set by `setResolvedTestInfoHeader`; `undefined` when absent or malformed. */
export function getResolvedTestInfo(
  requestHeaders: Headers,
): TestInfo | null | undefined {
  const value = requestHeaders.get(PACK_TEST_INFO_HEADER);
  if (value === null) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed === null) return null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      parsed.testVariant &&
      typeof parsed.testVariant.id === 'string'
    ) {
      return parsed as TestInfo;
    }
  } catch {
    // fall through
  }
  return undefined;
}
