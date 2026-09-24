import {notFound} from 'next/navigation';

// Renders from per-request state, so it intentionally blocks instead of
// streaming a static shell. See `instant` in app/[locale]/layout.tsx.
export const instant = false;

/**
 * Catch-all for URLs that match no route (formerly `routes/$.tsx`). Shopify
 * URL redirects and `/admin` are resolved in the proxy before rendering.
 */
export default function CatchAllPage() {
  notFound();
}
