'use client';

import {createContext, useContext, useMemo} from 'react';
import type {ReactNode} from 'react';

/**
 * Loader data for client components.
 *
 * In React Router every route module's loader data was available through
 * `useLoaderData()` / `useRouteLoaderData()` / `useMatches()`. In the App
 * Router, server components run the loaders (see `runLoader` in
 * `~/lib/server/route`) and pass the result to `<RouteDataProvider>`, which
 * rebuilds the same "matches" stack so existing hooks keep working:
 *
 * - the root layout provides `id="root"`
 * - nested layouts/pages provide their own ids; the nearest one wins for
 *   `useLoaderData()`
 */

export type RouteMatch<T = unknown> = {
  id: string;
  data: T;
  /** Alias of `data`, as in React Router 7 matches */
  loaderData: T;
};

const RouteMatchesContext = createContext<RouteMatch[]>([]);

export function RouteDataProvider({
  id,
  data,
  children,
}: {
  id: string;
  data: unknown;
  children: ReactNode;
}) {
  const parentMatches = useContext(RouteMatchesContext);
  const matches = useMemo(
    () => [
      ...parentMatches.filter((match) => match.id !== id),
      {id, data, loaderData: data},
    ],
    [parentMatches, id, data],
  );
  return (
    <RouteMatchesContext.Provider value={matches}>
      {children}
    </RouteMatchesContext.Provider>
  );
}

export function useMatches() {
  return useContext(RouteMatchesContext);
}

/** Data from the nearest route loader. */
export function useLoaderData<T = any>(): T {
  const matches = useContext(RouteMatchesContext);
  return matches[matches.length - 1]?.data as T;
}

/** Data from a specific route loader, e.g. `useRouteLoaderData('root')`. */
export function useRouteLoaderData<T = any>(id: string): T | undefined {
  const matches = useContext(RouteMatchesContext);
  return matches.find((match) => match.id === id)?.data as T | undefined;
}
