'use client';

import {ApplicationError} from '~/components/Document';

/** Route error boundary (formerly the root `ErrorBoundary`). */
export default function RouteError({
  error,
}: {
  error: Error & {digest?: string};
}) {
  return <ApplicationError error={error} />;
}
