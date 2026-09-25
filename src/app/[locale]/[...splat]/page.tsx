import {notFound} from 'next/navigation';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

/**
 * Catch-all for URLs that match no route (formerly `routes/$.tsx`). Shopify
 * URL redirects and `/admin` are resolved in the proxy before rendering.
 */
export default function CatchAllPage() {
  notFound();
}
