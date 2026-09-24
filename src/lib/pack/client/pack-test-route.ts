'use client';

import Cookies from 'js-cookie';
import {useEffect, useState} from 'react';

import {useLoaderData, useRevalidator, useRouteLoaderData} from '~/lib/router';

import {PACK_EXPOSED_TEST_COOKIE_ID} from '../constants';
import type {Test} from '../types';

import {usePackTestContext} from './pack-test-context';

export type PackTestImpressionSelector =
  string | string[] | ((packTestInfo: Test) => string | string[] | undefined);

export type PackTestRouteProps = {
  impressionSelector?: PackTestImpressionSelector;
};

type TriggeredExposure = {packTestInfo: Test; exposureTime: number};

type RootPreviewData = {
  packIsPreviewMode?: boolean;
  isPreviewModeEnabled?: boolean;
};

function getImpressionSectionSelectors(packTestInfo: Test) {
  const sectionIds = packTestInfo.impression?.sectionIds || [];
  return [...new Set(sectionIds)].map(
    (sectionId) => `section[data-comp-id="${sectionId}"]`,
  );
}

function getImpressionSelectors(
  packTestInfo: Test,
  impressionSelector?: PackTestImpressionSelector,
): string[] {
  if (!impressionSelector) {
    return getImpressionSectionSelectors(packTestInfo);
  }
  const resolvedSelector =
    typeof impressionSelector === 'function'
      ? impressionSelector(packTestInfo)
      : impressionSelector;
  if (!resolvedSelector) {
    return getImpressionSectionSelectors(packTestInfo);
  }
  return Array.isArray(resolvedSelector)
    ? resolvedSelector
    : [resolvedSelector];
}

function serializeExposedTestCookieValue(packTestInfo: Test) {
  return JSON.stringify({
    id: packTestInfo.id,
    handle: packTestInfo.handle,
    testVariant: {
      id: packTestInfo.testVariant.id,
      handle: packTestInfo.testVariant.handle,
    },
  });
}

function setExposedTestCookie(packTestInfo: Test) {
  // Read by the server on the next request to know this session was exposed
  const expires = new Date();
  expires.setHours(expires.getHours() + 24);
  Cookies.set(
    PACK_EXPOSED_TEST_COOKIE_ID,
    serializeExposedTestCookieValue(packTestInfo),
    {expires},
  );
}

const usePackLoaderData = (impressionSelector?: PackTestImpressionSelector) => {
  const [exposedTestInfo, setExposedTestInfo] = useState<Test | undefined>();
  const [triggeredExposure, setTriggeredExposure] = useState<
    TriggeredExposure | undefined
  >();

  const loaderData = useLoaderData<{packTestInfo?: Test} | undefined>();
  const packTestInfo = loaderData?.packTestInfo;

  const rootData = useRouteLoaderData<RootPreviewData>('root');
  const packIsPreviewMode =
    rootData?.packIsPreviewMode || rootData?.isPreviewModeEnabled;

  const revalidator = useRevalidator();

  const {
    testExposureCallback,
    hasUserConsent,
    pendingExposureQueue,
    setPendingExposureQueue,
  } = usePackTestContext();

  const exposedTestCookieString = Cookies.get(PACK_EXPOSED_TEST_COOKIE_ID);

  // Reset the trigger when the page's test or variant changes
  useEffect(() => {
    if (packTestInfo?.id !== triggeredExposure?.packTestInfo.id) {
      setTriggeredExposure(undefined);
      return;
    }
    if (
      packTestInfo?.testVariant?.id !==
      triggeredExposure?.packTestInfo.testVariant.id
    ) {
      setTriggeredExposure(undefined);
    }
  }, [triggeredExposure, packTestInfo]);

  // Decide when the exposure happens: immediately, or when a test section is in view
  useEffect(() => {
    if (
      !packTestInfo ||
      !!packIsPreviewMode ||
      !!exposedTestCookieString ||
      !!exposedTestInfo
    ) {
      return;
    }

    if (
      triggeredExposure?.packTestInfo.id === packTestInfo.id &&
      triggeredExposure.packTestInfo.testVariant.id ===
        packTestInfo.testVariant.id
    ) {
      return;
    }

    if (
      packTestInfo.impressionTrigger !== 'ON_ELEMENT_VIEW' ||
      typeof window === 'undefined' ||
      typeof IntersectionObserver === 'undefined'
    ) {
      setTriggeredExposure({packTestInfo, exposureTime: Date.now()});
      return;
    }

    const impressionSectionSelectors = getImpressionSelectors(
      packTestInfo,
      impressionSelector,
    );

    if (impressionSectionSelectors.length === 0) {
      console.warn(
        `[Pack Test] Test "${packTestInfo.id}" uses ON_ELEMENT_VIEW but has no selectors to observe. Impression will not be tracked.`,
      );
      return;
    }

    let isTriggered = false;
    const observedElements = new Set<Element>();
    // Assigned below, after `cleanup` (which closes over it) is defined
    // eslint-disable-next-line prefer-const
    let observer: IntersectionObserver | undefined;
    let mutationObserver: MutationObserver | undefined;
    let observerTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      if (observerTimeoutId) {
        clearTimeout(observerTimeoutId);
      }
    };

    const triggerImpression = () => {
      if (isTriggered) return;
      isTriggered = true;
      cleanup();
      setTriggeredExposure({packTestInfo, exposureTime: Date.now()});
    };

    const observeMatchingElements = () => {
      if (!observer || isTriggered) return;
      impressionSectionSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          if (observedElements.has(element)) return;
          observedElements.add(element);
          observer?.observe(element);
        });
      });
      if (observedElements.size > 0) {
        mutationObserver?.disconnect();
        mutationObserver = undefined;
        if (observerTimeoutId) {
          clearTimeout(observerTimeoutId);
          observerTimeoutId = undefined;
        }
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          triggerImpression();
        }
      },
      {threshold: 0.1},
    );

    observeMatchingElements();

    // Sections may mount after this effect (streaming, lazy sections)
    if (
      !isTriggered &&
      observedElements.size === 0 &&
      typeof MutationObserver !== 'undefined'
    ) {
      mutationObserver = new MutationObserver(() => {
        observeMatchingElements();
      });
      mutationObserver.observe(document.body, {childList: true, subtree: true});
      observerTimeoutId = setTimeout(() => {
        if (!isTriggered && observedElements.size === 0) {
          console.warn(
            `[Pack Test] Impression target not found within 30s for test "${packTestInfo.id}". Stopping observer.`,
          );
          cleanup();
        }
      }, 30000);
    }

    return cleanup;
  }, [
    triggeredExposure,
    exposedTestCookieString,
    exposedTestInfo,
    packIsPreviewMode,
    packTestInfo,
    impressionSelector,
  ]);

  // No consent yet: queue the exposure
  useEffect(() => {
    if (
      triggeredExposure &&
      !packIsPreviewMode &&
      !hasUserConsent &&
      !exposedTestCookieString
    ) {
      setPendingExposureQueue?.((prev) => {
        if (prev.has(triggeredExposure.packTestInfo.id)) return prev;
        const nextQueue = new Map(prev);
        nextQueue.set(triggeredExposure.packTestInfo.id, triggeredExposure);
        return nextQueue;
      });
    }
  }, [
    triggeredExposure,
    hasUserConsent,
    packIsPreviewMode,
    exposedTestCookieString,
    setPendingExposureQueue,
  ]);

  // Consent: record the exposure, flush the queue, refetch without the first-exposure data
  useEffect(() => {
    if (
      triggeredExposure &&
      hasUserConsent &&
      !exposedTestCookieString &&
      !packIsPreviewMode &&
      !exposedTestInfo
    ) {
      const {packTestInfo: activeTestInfo, exposureTime} = triggeredExposure;

      setExposedTestCookie(activeTestInfo);
      setExposedTestInfo(activeTestInfo);

      // Call tracking callbacks for previous exposures
      pendingExposureQueue?.forEach((data, key) => {
        if (key === activeTestInfo.id) return;
        try {
          testExposureCallback?.({
            ...data.packTestInfo,
            exposureTime: data.exposureTime,
          });
        } catch (error) {
          console.error('Failed to call testExposure after consent:', error);
        }
      });

      testExposureCallback?.({...activeTestInfo, exposureTime});
      setPendingExposureQueue?.(new Map());

      // TODO: This results in flashing of UI driven by site settings data.
      // Delayed as in the original (React Router lazy route discovery race).
      setTimeout(() => {
        revalidator.revalidate();
      }, 750);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    triggeredExposure,
    exposedTestCookieString,
    pendingExposureQueue,
    testExposureCallback,
    exposedTestInfo,
    hasUserConsent,
    packIsPreviewMode,
    setPendingExposureQueue,
  ]);

  // Consent given after navigating away from the exposing page: flush the queue
  useEffect(() => {
    if (
      !!triggeredExposure ||
      !hasUserConsent ||
      !!packIsPreviewMode ||
      !pendingExposureQueue?.size ||
      !!exposedTestCookieString
    ) {
      return;
    }

    let firstQueuedTest: Test | undefined;
    pendingExposureQueue.forEach((data) => {
      if (!firstQueuedTest) {
        firstQueuedTest = data.packTestInfo;
      }
      try {
        testExposureCallback?.({
          ...data.packTestInfo,
          exposureTime: data.exposureTime,
        });
      } catch (error) {
        console.error(
          'Failed to call queued testExposure after consent:',
          error,
        );
      }
    });

    if (firstQueuedTest) {
      setExposedTestCookie(firstQueuedTest);
      setExposedTestInfo(firstQueuedTest);
    }

    setPendingExposureQueue?.(new Map());
  }, [
    triggeredExposure,
    exposedTestCookieString,
    hasUserConsent,
    packIsPreviewMode,
    pendingExposureQueue,
    setPendingExposureQueue,
    testExposureCallback,
  ]);
};

/**
 * Tracks A/B test exposure for the current route: reads `packTestInfo` from
 * the nearest loader data (only present on a visitor's first exposure) and
 * the preview flag from the root data. Render once per page that queries Pack.
 */
export const PackTestRoute = ({
  impressionSelector,
}: PackTestRouteProps = {}) => {
  usePackLoaderData(impressionSelector);

  return null;
};
