'use client';

import {createContext, useContext} from 'react';
import type {Dispatch, SetStateAction} from 'react';

import type {Test} from '../types';

export type {Test};

export interface TestExposureCallbackArg extends Test {
  exposureTime: number;
}

export type PackTestContextValue = {
  testExposureCallback?: (test: TestExposureCallbackArg) => void;
  hasUserConsent?: boolean | undefined;
  pendingExposureQueue?: Map<any, any>;
  setPendingExposureQueue?: Dispatch<SetStateAction<Map<any, any>>>;
  exposedExperiments?: Set<unknown>;
};

export const PackTestContext = createContext<PackTestContextValue>({});

export const usePackTestContext = () => useContext(PackTestContext);
