'use client';

import {forwardRef} from 'react';
import NextLink from 'next/link';
import type {AnchorHTMLAttributes, ReactNode} from 'react';

/**
 * React Router-style `<Link>` on `next/link`.
 *
 * `prefetch`: React Router's `'intent' | 'render' | 'viewport'` enable
 * prefetching and `'none'` disables it. `reloadDocument` renders a plain
 * anchor for a full document navigation (required for Customer Account
 * login/logout routes, which return raw redirects).
 */

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  to: string;
  children?: ReactNode;
  prefetch?: 'none' | 'intent' | 'render' | 'viewport';
  preventScrollReset?: boolean;
  reloadDocument?: boolean;
  replace?: boolean;
  relative?: 'route' | 'path';
  state?: unknown;
  viewTransition?: boolean;
};

const isExternalHref = (href: string) =>
  /^(https?:)?\/\//.test(href) || /^(mailto|tel|sms):/.test(href);

/**
 * Customer Account OAuth routes answer with raw redirects to Shopify, which
 * client-side navigation cannot follow, so they always get a document load.
 */
const isDocumentOnlyHref = (href: string) =>
  /^(\/[a-z]{2}-[a-z]{2})?\/account\/(login|authorize|refresh|logout)(\?|#|$)/i.test(
    href,
  );

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      to,
      prefetch = 'none',
      preventScrollReset = false,
      reloadDocument = false,
      replace = false,
      relative: _relative,
      state: _state,
      viewTransition: _viewTransition,
      children,
      ...props
    },
    ref,
  ) => {
    if (
      reloadDocument ||
      isExternalHref(to) ||
      isDocumentOnlyHref(to) ||
      to.startsWith('#')
    ) {
      return (
        <a ref={ref} href={to} {...props}>
          {children}
        </a>
      );
    }

    return (
      <NextLink
        ref={ref}
        href={to}
        prefetch={prefetch === 'none' ? false : null}
        replace={replace}
        scroll={!preventScrollReset}
        {...props}
      >
        {children}
      </NextLink>
    );
  },
);

Link.displayName = 'Link';
