import {forwardRef} from 'react';
import type {AnchorHTMLAttributes, ReactNode} from 'react';

import {useLocale} from '~/hooks';
import {Link as RouterLink} from '~/lib/router';
import type {LinkProps as RouterLinkProps} from '~/lib/router';

/*
 * CMS-aware link on `~/lib/router`'s `Link` (next/link). The React Router
 * props are mapped there: `prefetch` ('none' disables prefetching),
 * `preventScrollReset` (scroll={false}), `replace`, and `reloadDocument`
 * (plain anchor, full document navigation).
 */

const getValidatedHref = ({
  href,
  type,
  pathPrefix,
}: {
  href: string | undefined | null;
  type: string | undefined | null;
  pathPrefix: string;
}) => {
  if (!href) return '';
  if (type === 'isPage') {
    return `${pathPrefix}${href}`;
  }
  if (type === 'isExternal') {
    if (href.startsWith('/')) return `${pathPrefix}${href}`;
    let externalHref;
    try {
      externalHref = new URL(href).href;
    } catch (error) {
      externalHref = `https://${href}`;
    }
    return externalHref;
  }
  if (type === 'isEmail') {
    return href.startsWith('mailto:') ? href : `mailto:${href}`;
  }
  if (type === 'isPhone') {
    return href.startsWith('tel:') ? href : `tel:${href}`;
  }
  return href;
};

type LinkProps = {
  children?: ReactNode;
  className?: string;
  draggable?: boolean;
  href?: string | undefined | null;
  isExternal?: boolean;
  newTab?: boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  prefetch?: RouterLinkProps['prefetch']; // 'none' | 'intent' | 'viewport' | 'render'
  preventScrollReset?: RouterLinkProps['preventScrollReset'];
  relative?: RouterLinkProps['relative'];
  reloadDocument?: RouterLinkProps['reloadDocument'];
  replace?: RouterLinkProps['replace'];
  state?: RouterLinkProps['state'];
  style?: React.CSSProperties;
  tabIndex?: number | undefined;
  text?: string;
  to?: string | undefined | null;
  type?: 'isPage' | 'isExternal' | 'isEmail' | 'isPhone' | undefined | null;
  url?: string | undefined | null;
} & Omit<React.HTMLProps<HTMLAnchorElement>, 'ref' | 'type'>;

export const Link = forwardRef(
  (
    {
      children,
      className,
      href = '', // html property
      isExternal = false, // cms property
      newTab = false,
      prefetch = 'viewport', // react router property
      preventScrollReset = false, // react router property
      relative, // react router property
      reloadDocument = false, // react router property
      replace = false, // react router property
      state, // react router property
      text = '', // cms property
      to = '', // react router property
      type = 'isPage', // cms property
      url = '', // cms property
      ...props
    }: LinkProps,
    ref: React.Ref<HTMLAnchorElement> | undefined,
  ) => {
    const {pathPrefix} = useLocale();
    const initialHref = (to || href || url) as string;

    const finalHref = getValidatedHref({
      href: initialHref,
      type: isExternal ? 'isExternal' : type,
      pathPrefix,
    });

    return finalHref ? (
      <RouterLink
        className={className}
        prefetch={prefetch}
        preventScrollReset={preventScrollReset}
        ref={ref}
        relative={relative}
        reloadDocument={reloadDocument}
        replace={replace}
        state={state}
        to={finalHref}
        {...(newTab ? {target: '_blank'} : null)}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children || text}
      </RouterLink>
    ) : (
      <div
        className={className}
        ref={ref as React.Ref<HTMLDivElement>}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children || text}
      </div>
    );
  },
);

Link.displayName = 'Link';
