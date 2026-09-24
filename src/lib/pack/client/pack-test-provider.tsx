'use client';

import {useState} from 'react';
import type {PropsWithChildren} from 'react';

import {PackTestContext} from './pack-test-context';
import type {Test} from './pack-test-context';

export interface PackTestProviderProps {
  testExposureCallback?: (test: Test) => void;
  hasUserConsent?: boolean;
}

export function PackTestProvider({
  children,
  testExposureCallback,
  hasUserConsent = false,
}: PropsWithChildren<PackTestProviderProps>) {
  const [pendingExposureQueue, setPendingExposureQueue] = useState(
    () => new Map(),
  );
  const [exposedExperiments] = useState(() => new Set());

  return (
    <PackTestContext.Provider
      value={{
        testExposureCallback: (test) => {
          testExposureCallback?.(test);
        },
        hasUserConsent,
        pendingExposureQueue,
        setPendingExposureQueue,
        exposedExperiments,
      }}
    >
      {children}
    </PackTestContext.Provider>
  );
}
