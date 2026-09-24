import {useCallback} from 'react';

/** Hydrogen's registered logout handler (see `src/proxy.ts`). */
export const CUSTOMER_LOGOUT_ACTION = '/account/logout';

/**
 * Log the customer out with a native form POST to `/account/logout`. It must be
 * a full document navigation: the handler checks for a same-origin POST and
 * responds with a redirect to Shopify's logout endpoint, which `fetch` cannot
 * follow. Prefer rendering `<form method="post" action="/account/logout">`
 * directly where possible so logout works without JavaScript.
 */
export function useCustomerLogOut() {
  const customerLogOut = useCallback(() => {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = CUSTOMER_LOGOUT_ACTION;
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
  }, []);

  return {customerLogOut};
}
