'use client';

import {forwardRef, useCallback, useMemo, useRef, useState} from 'react';
import type {FormEvent, FormHTMLAttributes} from 'react';
import {useRouter} from 'next/navigation';

/**
 * `useFetcher()` on plain `fetch`.
 *
 * - `submit()` without an `action` posts to the current URL, like React
 *   Router. The proxy routes non-GET page requests to the page's
 *   `route-actions` handler (see `src/proxy.ts`).
 * - `load()` GETs an API route and stores its JSON.
 * - After a successful non-GET submission the current route's server
 *   components are refreshed, matching React Router's automatic revalidation.
 * - Redirect responses are followed with client navigation.
 */

type FetcherState = 'idle' | 'submitting' | 'loading';

type SubmitTarget =
  FormData | URLSearchParams | HTMLFormElement | Record<string, unknown> | null;

type SubmitOptions = {
  method?: string;
  action?: string;
  encType?:
    | 'application/x-www-form-urlencoded'
    | 'multipart/form-data'
    | 'application/json'
    | 'text/plain';
  preventScrollReset?: boolean;
};

export type Fetcher<T = any> = {
  state: FetcherState;
  data: T | undefined;
  formData: FormData | undefined;
  submit: (target: SubmitTarget, options?: SubmitOptions) => Promise<void>;
  load: (href: string) => Promise<void>;
  Form: ReturnType<typeof createFetcherForm>;
};

const fetcherStore = new Map<string, unknown>();

function toFormData(target: SubmitTarget) {
  if (!target) return new FormData();
  if (target instanceof FormData) return target;
  if (
    typeof HTMLFormElement !== 'undefined' &&
    target instanceof HTMLFormElement
  )
    return new FormData(target);
  const formData = new FormData();
  const entries =
    target instanceof URLSearchParams
      ? Array.from(target.entries())
      : Object.entries(target);
  entries.forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(
      key,
      typeof value === 'object' && !(value instanceof Blob)
        ? JSON.stringify(value)
        : (value as string | Blob),
    );
  });
  return formData;
}

function currentUrl() {
  return typeof window === 'undefined'
    ? '/'
    : `${window.location.pathname}${window.location.search}`;
}

async function readResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createFetcherForm(
  submit: (target: SubmitTarget, options?: SubmitOptions) => Promise<void>,
) {
  type FetcherFormProps = Omit<
    FormHTMLAttributes<HTMLFormElement>,
    'action' | 'onSubmit'
  > & {
    action?: string;
    onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  };
  const FetcherForm = forwardRef<HTMLFormElement, FetcherFormProps>(
    ({onSubmit, method = 'post', action, ...props}, ref) => (
      <form
        ref={ref}
        method={method}
        action={action}
        {...props}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          onSubmit?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          submit(event.currentTarget, {method, action});
        }}
      />
    ),
  );
  FetcherForm.displayName = 'FetcherForm';
  return FetcherForm;
}

export function useFetcher<T = any>({key}: {key?: string} = {}): Fetcher<T> {
  const router = useRouter();
  const [state, setState] = useState<FetcherState>('idle');
  const [formData, setFormData] = useState<FormData>();
  const [data, setDataState] = useState<T | undefined>(() =>
    key ? (fetcherStore.get(key) as T | undefined) : undefined,
  );
  const abortRef = useRef<AbortController | null>(null);

  const setData = useCallback(
    (value: T) => {
      if (key) fetcherStore.set(key, value);
      setDataState(value);
    },
    [key],
  );

  const handleResponse = useCallback(
    async (response: Response, isMutation: boolean) => {
      if (response.redirected && response.url) {
        const url = new URL(response.url);
        if (url.origin === window.location.origin) {
          router.push(`${url.pathname}${url.search}`);
        } else {
          window.location.href = response.url;
        }
        return;
      }
      setData((await readResponse(response)) as T);
      if (isMutation) router.refresh();
    },
    [router, setData],
  );

  const submit = useCallback(
    async (target: SubmitTarget, options: SubmitOptions = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const method = (options.method || 'GET').toUpperCase();
      const action = options.action || currentUrl();
      const body = toFormData(target);

      setFormData(body);
      setState(method === 'GET' ? 'loading' : 'submitting');
      try {
        let response: Response;
        if (method === 'GET') {
          const url = new URL(action, window.location.origin);
          body.forEach((value, name) => {
            if (typeof value === 'string') url.searchParams.append(name, value);
          });
          response = await fetch(url, {signal: controller.signal});
        } else if (options.encType === 'application/json') {
          response = await fetch(action, {
            method,
            signal: controller.signal,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(
              target && !(target instanceof FormData)
                ? target
                : Object.fromEntries(body),
            ),
          });
        } else if (options.encType === 'application/x-www-form-urlencoded') {
          response = await fetch(action, {
            method,
            signal: controller.signal,
            body: new URLSearchParams(body as any),
          });
        } else {
          response = await fetch(action, {
            method,
            signal: controller.signal,
            body,
          });
        }
        await handleResponse(response, method !== 'GET');
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('useFetcher:submit:error', error);
        }
      } finally {
        if (abortRef.current === controller) {
          setState('idle');
          setFormData(undefined);
        }
      }
    },
    [handleResponse],
  );

  const load = useCallback(
    async (href: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState('loading');
      try {
        const response = await fetch(href, {signal: controller.signal});
        await handleResponse(response, false);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('useFetcher:load:error', error);
        }
      } finally {
        if (abortRef.current === controller) setState('idle');
      }
    },
    [handleResponse],
  );

  const Form = useMemo(() => createFetcherForm(submit), [submit]);

  return {state, data, formData, submit, load, Form};
}
