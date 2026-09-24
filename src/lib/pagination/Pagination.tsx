'use client';

import {forwardRef, useEffect, useMemo, useState} from 'react';
import type {ForwardRefExoticComponent, ReactNode, RefAttributes} from 'react';
import {flattenConnection} from '@shopify/hydrogen-react';
import type {Maybe, PageInfo} from '@shopify/hydrogen/storefront-api-types';

import {Link, useLocation} from '~/lib/router';
import type {LinkProps} from '~/lib/router';

/**
 * Port of `<Pagination>` from the React Router build of `@shopify/hydrogen`,
 * on `~/lib/router`'s `Link`/`useLocation`. Same render-prop API
 * (`nodes`, `NextLink`, `PreviousLink`, `isLoading`, `hasNextPage`, ...) and
 * the same URL params (`cursor`, `direction`, optionally namespaced), so
 * loaders keep using `getPaginationVariables`.
 *
 * React Router kept the already-loaded nodes in `location.state` so "load
 * more" appended pages. The App Router has no location state, so the state is
 * kept in an in-memory store keyed by the destination URL (pathname +
 * search), written when a `NextLink`/`PreviousLink` is clicked and read back
 * when that URL renders. Like before, the first render after a full page load
 * only shows the current page's nodes. Because stored state is keyed by the
 * exact URL, a navigation that changes other params (filters, sort) renders
 * without accumulated nodes, which is what the old cleanup effect ensured.
 */

type Connection<NodesType> =
  | {
      nodes: Array<NodesType>;
      pageInfo: PageInfo;
    }
  | {
      edges: Array<{
        node: NodesType;
      }>;
      pageInfo: PageInfo;
    };

export type PaginationConnection<NodesType> = Connection<NodesType>;

type NamespacedPaginationState = {
  pageInfo: {
    endCursor: Maybe<string> | undefined;
    startCursor: Maybe<string> | undefined;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  nodes: Array<unknown>;
};

export type PaginationState = {
  pagination?: Record<string, NamespacedPaginationState>;
  [key: string]: unknown;
};

type PaginationLink = ForwardRefExoticComponent<
  Omit<LinkProps, 'to'> & RefAttributes<HTMLAnchorElement>
>;

export interface PaginationInfo<NodesType> {
  /** The paginated array of nodes. You should map over and render this array. */
  nodes: Array<NodesType>;
  /** Link to the next page of paginated data (renders nothing when there is none). */
  NextLink: PaginationLink;
  /** Link to the previous page of paginated data (renders nothing when there is none). */
  PreviousLink: PaginationLink;
  /** The URL to the previous page of paginated data. */
  previousPageUrl: string;
  /** The URL to the next page of paginated data. */
  nextPageUrl: string;
  /** True if the cursor has next paginated data */
  hasNextPage: boolean;
  /** True if the cursor has previous paginated data */
  hasPreviousPage: boolean;
  /** True if we are in the process of fetching another page of data */
  isLoading: boolean;
  /** Accumulated pagination state (previously passed as React Router `location.state`). */
  state: PaginationState;
}

export type PaginationProps<NodesType> = {
  /** The response from `storefront.query` for a paginated request, including `pageInfo`. */
  connection: Connection<NodesType>;
  /** A render prop that includes pagination data and helpers. */
  children?: (info: PaginationInfo<NodesType>) => ReactNode;
  /** A namespace to avoid URL param conflicts with multiple `Pagination` components on a page. */
  namespace?: string;
};

/** Replacement for React Router `location.state`, keyed by `pathname + search`. */
const locationStateStore = new Map<string, PaginationState>();
const LOCATION_STATE_STORE_LIMIT = 50;

function setLocationState(key: string, state: PaginationState) {
  locationStateStore.delete(key);
  if (locationStateStore.size >= LOCATION_STATE_STORE_LIMIT) {
    const oldestKey = locationStateStore.keys().next().value;
    if (oldestKey !== undefined) locationStateStore.delete(oldestKey);
  }
  locationStateStore.set(key, state);
}

/** Replacement for `window.__hydrogenHydrated` */
let hydrogenHydrated = false;

export function Pagination<NodesType>({
  connection,
  children = () => {
    console.warn('<Pagination> requires children to work properly');
    return null;
  },
  namespace = '',
}: PaginationProps<NodesType>): ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();
  const locationState = locationStateStore.get(location.key);

  useEffect(() => {
    // The navigation finished once the location changes
    setIsLoading(false);
  }, [location.key]);

  const {
    endCursor,
    hasNextPage,
    hasPreviousPage,
    nextPageUrl,
    nodes,
    previousPageUrl,
    startCursor,
  } = usePagination<NodesType>(connection, namespace);

  const state = useMemo<PaginationState>(
    () => ({
      ...locationState,
      pagination: {
        ...(locationState?.pagination || {}),
        [namespace]: {
          pageInfo: {
            endCursor,
            hasPreviousPage,
            hasNextPage,
            startCursor,
          },
          nodes,
        },
      },
    }),
    [
      endCursor,
      hasNextPage,
      hasPreviousPage,
      startCursor,
      nodes,
      namespace,
      locationState,
    ],
  );

  const {pathname} = location;

  const NextLink = useMemo<PaginationLink>(
    () =>
      forwardRef<HTMLAnchorElement, Omit<LinkProps, 'to'>>(
        function NextLink(props, ref) {
          return hasNextPage ? (
            <Link
              preventScrollReset
              {...props}
              to={nextPageUrl}
              replace
              ref={ref}
              onClick={() => {
                setLocationState(`${pathname}${nextPageUrl}`, state);
                setIsLoading(true);
              }}
            />
          ) : null;
        },
      ),
    [hasNextPage, nextPageUrl, pathname, state],
  );

  const PreviousLink = useMemo<PaginationLink>(
    () =>
      forwardRef<HTMLAnchorElement, Omit<LinkProps, 'to'>>(
        function PrevLink(props, ref) {
          return hasPreviousPage ? (
            <Link
              preventScrollReset
              {...props}
              to={previousPageUrl}
              replace
              ref={ref}
              onClick={() => {
                setLocationState(`${pathname}${previousPageUrl}`, state);
                setIsLoading(true);
              }}
            />
          ) : null;
        },
      ),
    [hasPreviousPage, previousPageUrl, pathname, state],
  );

  return children({
    state,
    hasNextPage,
    hasPreviousPage,
    isLoading,
    nextPageUrl,
    nodes,
    previousPageUrl,
    NextLink,
    PreviousLink,
  });
}

function makeError(prop: string): never {
  throw new Error(
    `The Pagination component requires ${
      '`' + prop + '`'
    } to be a part of your query. See the guide on how to setup your query to include ${
      '`' + prop + '`'
    }: https://shopify.dev/docs/custom-storefronts/hydrogen/data-fetching/pagination#setup-the-paginated-query`,
  );
}

function usePagination<NodesType>(
  connection: Connection<NodesType>,
  namespace = '',
): Omit<
  PaginationInfo<NodesType>,
  'isLoading' | 'state' | 'NextLink' | 'PreviousLink'
> & {
  startCursor: Maybe<string> | undefined;
  endCursor: Maybe<string> | undefined;
} {
  if (!connection.pageInfo) {
    makeError('pageInfo');
  }
  if (typeof connection.pageInfo.startCursor === 'undefined') {
    makeError('pageInfo.startCursor');
  }
  if (typeof connection.pageInfo.endCursor === 'undefined') {
    makeError('pageInfo.endCursor');
  }
  if (typeof connection.pageInfo.hasNextPage === 'undefined') {
    makeError('pageInfo.hasNextPage');
  }
  if (typeof connection.pageInfo.hasPreviousPage === 'undefined') {
    makeError('pageInfo.hasPreviousPage');
  }

  const {search, key} = useLocation();
  const state = locationStateStore.get(key);

  const cursorParam = namespace ? `${namespace}_cursor` : 'cursor';
  const directionParam = namespace ? `${namespace}_direction` : 'direction';

  const params = new URLSearchParams(search);
  const direction = params.get(directionParam);
  const isPrevious = direction === 'previous';

  const nodes = useMemo(() => {
    const flattened = flattenConnection(connection as any) as NodesType[];
    const stateNodes = state?.pagination?.[namespace]?.nodes as
      NodesType[] | undefined;
    if (!hydrogenHydrated || !stateNodes) {
      return flattened;
    }

    if (isPrevious) {
      return [...flattened, ...(stateNodes || [])];
    } else {
      return [...(stateNodes || []), ...flattened];
    }
  }, [state, connection, namespace]);

  const currentPageInfo = useMemo(() => {
    const stateInfo = state?.pagination?.[namespace]?.pageInfo;

    let pageStartCursor =
      !hydrogenHydrated || stateInfo?.startCursor === undefined
        ? connection.pageInfo.startCursor
        : stateInfo.startCursor;

    let pageEndCursor =
      !hydrogenHydrated || stateInfo?.endCursor === undefined
        ? connection.pageInfo.endCursor
        : stateInfo.endCursor;

    let previousPageExists =
      !hydrogenHydrated || stateInfo?.hasPreviousPage === undefined
        ? connection.pageInfo.hasPreviousPage
        : stateInfo.hasPreviousPage;

    let nextPageExists =
      !hydrogenHydrated || stateInfo?.hasNextPage === undefined
        ? connection.pageInfo.hasNextPage
        : stateInfo.hasNextPage;

    if (state?.pagination?.[namespace]?.nodes) {
      if (isPrevious) {
        pageStartCursor = connection.pageInfo.startCursor;
        previousPageExists = connection.pageInfo.hasPreviousPage;
      } else {
        pageEndCursor = connection.pageInfo.endCursor;
        nextPageExists = connection.pageInfo.hasNextPage;
      }
    }

    return {
      startCursor: pageStartCursor,
      endCursor: pageEndCursor,
      hasPreviousPage: previousPageExists,
      hasNextPage: nextPageExists,
    };
  }, [
    isPrevious,
    state,
    namespace,
    connection.pageInfo.hasNextPage,
    connection.pageInfo.hasPreviousPage,
    connection.pageInfo.startCursor,
    connection.pageInfo.endCursor,
  ]);

  // Mirrors `window.__hydrogenHydrated`: ignore stored state until hydrated
  useEffect(() => {
    hydrogenHydrated = true;
  }, []);

  const previousPageUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    params.set(directionParam, 'previous');
    currentPageInfo.startCursor &&
      params.set(cursorParam, currentPageInfo.startCursor);
    return `?${params.toString()}`;
  }, [search, currentPageInfo.startCursor]);

  const nextPageUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    params.set(directionParam, 'next');
    currentPageInfo.endCursor &&
      params.set(cursorParam, currentPageInfo.endCursor);
    return `?${params.toString()}`;
  }, [search, currentPageInfo.endCursor]);

  return {...currentPageInfo, previousPageUrl, nextPageUrl, nodes};
}
