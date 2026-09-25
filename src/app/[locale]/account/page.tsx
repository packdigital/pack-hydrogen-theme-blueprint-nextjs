import {accountHomeLoader} from '~/lib/customer/account.server';
import {runLoader} from '~/lib/server/route';

// Opts out of instant-navigation and static-shell validation (checks only,
// rendering is unchanged). See `instant` in app/[locale]/layout.tsx.
export const instant = false;

type Params = {locale: string};

/** `/account` always redirects (see `accountHomeLoader`). */
export default async function AccountHomePage({
  params,
}: {
  params: Promise<Params>;
}) {
  await runLoader(accountHomeLoader, await params);
  return null;
}
