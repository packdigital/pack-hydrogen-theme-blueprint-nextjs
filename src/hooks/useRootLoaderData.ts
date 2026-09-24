import {useMatches} from '~/lib/router';
import type {RootLoaderData as RootData} from '~/lib/server/root-loader';

export type RootLoaderData = RootData;

export function useRootLoaderData(): RootLoaderData {
  const [root, layout, child] = useMatches();
  const rootData = root?.loaderData as RootLoaderData;
  const layoutData = layout?.loaderData as {url?: string};
  const childData = child?.loaderData as {url?: string};
  return {
    ...(rootData || null),
    url: childData?.url || layoutData?.url || rootData?.url,
  } as RootLoaderData;
}
