'use client';

import {useCallback, useMemo, useTransition} from 'react';
import {
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';

/**
 * React Router navigation hooks implemented on `next/navigation`.
 */

/** Internal locale segment the proxy rewrites unprefixed URLs to. */
export const DEFAULT_LOCALE_SEGMENT = 'default';

/** Strip the proxy's internal `/default` locale segment, if Next exposes it. */
export function normalizePathname(pathname: string | null) {
  if (!pathname) return '/';
  if (pathname === `/${DEFAULT_LOCALE_SEGMENT}`) return '/';
  if (pathname.startsWith(`/${DEFAULT_LOCALE_SEGMENT}/`)) {
    return pathname.slice(DEFAULT_LOCALE_SEGMENT.length + 1);
  }
  return pathname;
}

export type Location = {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
};

export function useLocation(): Location {
  const pathname = normalizePathname(usePathname());
  const searchParams = useNextSearchParams();
  const searchString = searchParams?.toString() || '';
  return useMemo(() => {
    const search = searchString ? `?${searchString}` : '';
    return {
      pathname,
      search,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
      state: null,
      key: `${pathname}${search}`,
    };
  }, [pathname, searchString]);
}

type NavigateOptions = {
  replace?: boolean;
  preventScrollReset?: boolean;
  state?: unknown;
};

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options: NavigateOptions = {}) => {
      if (typeof to === 'number') {
        if (to < 0) router.back();
        else router.forward();
        return;
      }
      const scroll = !options.preventScrollReset;
      if (options.replace) router.replace(to, {scroll});
      else router.push(to, {scroll});
    },
    [router],
  );
}

type SetSearchParams = (
  next:
    | URLSearchParams
    | Record<string, string>
    | string
    | ((
        prev: URLSearchParams,
      ) => URLSearchParams | Record<string, string> | string),
  options?: NavigateOptions,
) => void;

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const nextSearchParams = useNextSearchParams();
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const searchString = nextSearchParams?.toString() || '';
  const searchParams = useMemo(
    () => new URLSearchParams(searchString),
    [searchString],
  );

  const setSearchParams = useCallback<SetSearchParams>(
    (next, options = {}) => {
      const resolved =
        typeof next === 'function'
          ? next(new URLSearchParams(searchString))
          : next;
      const params = new URLSearchParams(resolved as any);
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      const scroll = !options.preventScrollReset;
      if (options.replace) router.replace(href, {scroll});
      else router.push(href, {scroll});
    },
    [pathname, router, searchString],
  );

  return [searchParams, setSearchParams];
}

/** `useRevalidator()` re-runs server components (loaders) for the current URL. */
export function useRevalidator() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return useMemo(
    () => ({
      state: isPending ? ('loading' as const) : ('idle' as const),
      revalidate: () => startTransition(() => router.refresh()),
    }),
    [isPending, router],
  );
}
