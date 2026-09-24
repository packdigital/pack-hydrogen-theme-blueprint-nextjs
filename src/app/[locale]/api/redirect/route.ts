import {routeHandler} from '~/lib/server/route';
import type {ActionArgs} from '~/lib/server/route';

/** React Router's `redirect()` (302 unless a status is given). */
function redirect(url: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Location', url);
  return new Response(null, {...init, status: init.status ?? 302, headers});
}

async function action({request}: ActionArgs) {
  let body;
  try {
    body = await request.formData();
  } catch (error) {}
  const to = String(body?.get('to') || '');
  const status = Number(body?.get('status'));
  const headersString = String(body?.get('headers') || '');
  let headers;
  try {
    headers = JSON.parse(headersString);
  } catch (error) {}

  if (!to)
    return Response.json({errors: ['Missing `to` in body']}, {status: 400});

  return status ? redirect(to, {status, headers}) : redirect(to, {headers});
}

export const POST = routeHandler(action);
