import 'server-only';

/**
 * Server-side environment. Replaces the `env` argument Oxygen passed to the
 * worker's fetch handler. Never import this from a client component; public
 * values reach the browser through the root layout's `ENV` object
 * (see `getPublicEnvs`).
 */
export function getEnv(): Env {
  return process.env as unknown as Env;
}
