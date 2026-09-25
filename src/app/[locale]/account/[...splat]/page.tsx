import {runLoader} from '~/lib/server/route';
import type {LoaderArgs} from '~/lib/server/route';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string; splat: string[]};

/** Unknown account URLs go to the account home (formerly `($locale).account.$`). */
async function loader({params}: LoaderArgs<Params>) {
  const {locale} = params;
  return new Response(null, {
    status: 302,
    headers: {Location: locale ? `/${locale}/account` : '/account'},
  });
}

export default async function AccountSplatPage({
  params,
}: {
  params: Promise<Params>;
}) {
  await runLoader(loader, await params);
  return null;
}
