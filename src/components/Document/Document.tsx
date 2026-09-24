'use client';

import {PreviewProvider} from '@pack/react';
import type {ReactNode} from 'react';

import {ContextsProvider} from '~/contexts';
import {Layout} from '~/components/Layout';
import {useLocale, useRootLoaderData} from '~/hooks';
import {registerSections} from '~/sections';
import {registerStorefrontSettings} from '~/settings';

import {Scripts as RootScripts} from './Scripts';

// Register Pack sections + storefront settings schema in the client module
// graph, so they exist both during SSR of client components and in the browser.
registerSections();
registerStorefrontSettings();

interface DocumentProps {
  children: ReactNode;
}

/**
 * Document body: global providers, Pack preview provider, site layout and
 * third-party scripts. The `<html>`/`<head>` shell lives in
 * `app/[locale]/layout.tsx`; meta tags come from Next's metadata API.
 */
export function Document({children}: DocumentProps) {
  const {customizerMeta, isPreviewModeEnabled, siteSettings} =
    useRootLoaderData();
  const locale = useLocale();

  return (
    <>
      <ContextsProvider>
        <PreviewProvider
          customizerMeta={customizerMeta}
          isPreviewModeEnabled={isPreviewModeEnabled}
          siteSettings={siteSettings}
        >
          <Layout key={`${locale.language}-${locale.country}`}>
            {children}
          </Layout>
        </PreviewProvider>
      </ContextsProvider>
      <RootScripts />
    </>
  );
}

Document.displayName = 'Document';
