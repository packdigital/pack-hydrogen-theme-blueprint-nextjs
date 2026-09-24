'use client';

import {useRouteLoaderData} from '~/lib/router';

import type {Test} from '../types';

type RootPackData = {
  abTest?: Test | null;
  packAbTest?: Test | null;
  sessionId?: string;
  packSessionId?: string;
};

export function useAbTest(): Test | null {
  const {abTest, packAbTest} = useRouteLoaderData<RootPackData>('root') || {};

  if (abTest === undefined && packAbTest === undefined) {
    throw new Error(
      'ERR_HY_MISSING_AB_TEST_CONTEXT: No A/B test found, are you sure you have call ...pack.getPackContextData() on root loader return? Doc: https://docs.packdigital.com/err/ERR_HY_MISSING_AB_TEST_CONTEXT',
    );
  }

  return abTest || packAbTest || null;
}

export function useAbTestSessionId(): string {
  const {sessionId, packSessionId} =
    useRouteLoaderData<RootPackData>('root') || {};

  if (!sessionId && !packSessionId) {
    throw new Error(
      'ERR_HY_MISSING_SESSION_ID: No Session ID found, are you sure you have call ...pack.getPackContextData() on root loader return? Doc: https://docs.packdigital.com/err/ERR_HY_MISSING_SESSION_ID',
    );
  }

  return (sessionId || packSessionId) as string;
}

export function useAbTestId(): string | undefined {
  return useAbTest()?.id;
}

export function useAbTestHandle(): string | undefined {
  return useAbTest()?.handle;
}

export function useAbTestVariantId(): string | undefined {
  return useAbTest()?.testVariant?.id;
}

export function useAbTestVariantHandle(): string | undefined {
  return useAbTest()?.testVariant?.handle;
}
