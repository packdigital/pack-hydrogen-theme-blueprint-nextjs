'use client';

import {ServerError} from '~/components/Document';

/** Errors thrown by the root layout itself (no layout, no providers). */
export default function GlobalError({
  error,
}: {
  error: Error & {digest?: string};
}) {
  return <ServerError error={error} />;
}
