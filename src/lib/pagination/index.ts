/**
 * Client cursor pagination (replaces `<Pagination>` from the React Router
 * build of `@shopify/hydrogen`). Loaders use the server-safe
 * `getPaginationVariables` from `~/lib/server/pagination`, which reads the
 * same `cursor` / `direction` params this component writes.
 */
export {Pagination} from './Pagination';
export type {
  PaginationConnection,
  PaginationInfo,
  PaginationProps,
  PaginationState,
} from './Pagination';
