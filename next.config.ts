import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Cache Components: 'use cache' / cacheLife / cacheTag replace
  // unstable_cache. Storefront API, Admin API and Pack reads are
  // 'use cache: remote' functions (src/lib/server/cache.ts, storefront.ts,
  // admin-api/admin.ts, pack/create-pack-client.ts).
  cacheComponents: true,
  // Pack's customizer loads the storefront in an iframe and the Playbook SDK
  // talks to it cross-origin, so mirror the CORS/PNA headers the Vite dev server
  // used to send.
  async headers() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/:path*',
        headers: [
          {key: 'Access-Control-Allow-Private-Network', value: 'true'},
          {key: 'Access-Control-Allow-Origin', value: '*'},
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {key: 'Access-Control-Allow-Headers', value: '*'},
        ],
      },
    ];
  },
  images: {
    // Images are served straight from the Shopify/Pack CDNs with URL transforms
    // (see @shopify/hydrogen-react <Image />), so Next's optimizer is not used.
    unoptimized: true,
  },
  // Tunnels used for customizer previews and Customer Account OAuth in dev.
  allowedDevOrigins: ['*.trycloudflare.com', '*.tryhydrogen.dev'],
};

export default nextConfig;
