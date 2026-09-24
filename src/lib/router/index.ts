/**
 * Drop-in replacements for the React Router APIs the storefront used, built
 * on the Next.js App Router. Client components import from here instead of
 * `react-router`.
 */
export {
  RouteDataProvider,
  useLoaderData,
  useMatches,
  useRouteLoaderData,
} from './route-data';
export type {RouteMatch} from './route-data';
export {
  DEFAULT_LOCALE_SEGMENT,
  normalizePathname,
  useLocation,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from './navigation';
export type {Location} from './navigation';
export {useFetcher} from './fetcher';
export type {Fetcher} from './fetcher';
export {Link} from './Link';
export type {LinkProps} from './Link';
