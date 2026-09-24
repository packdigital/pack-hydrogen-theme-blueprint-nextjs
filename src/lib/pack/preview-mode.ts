import 'server-only';

import type {Pack} from './create-pack-client';
import {clearExposedTestCookie, commitPackSessions} from './handle-request';
import type {PackCustomizerMeta} from './types';

const ROOT_PATH = '/' as const;

type PreviewModeArgs = {request: Request; pack: Pack};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}

function redirect(url: string, status = 302) {
  return new Response(null, {status, headers: {Location: url}});
}

function unauthorized(message: string) {
  return new Response(message, {status: 401, statusText: 'Unauthorized'});
}

function isLocalPath(request: Request, url: string) {
  try {
    // Our domain, based on the current request path
    const currentUrl = new URL(request.url);

    // If url is relative, the 2nd argument will act as the base domain.
    const urlToCheck = new URL(url, currentUrl.origin);

    // If the origins don't match the slug is not on our domain.
    return currentUrl.origin === urlToCheck.origin;
  } catch {
    return false;
  }
}

/**
 * What `@pack/hydrogen`'s `handleRequest` wrapper did to every response,
 * including these: clear `exposedTest`, commit the Pack sessions.
 */
async function finalize(request: Request, pack: Pack, response: Response) {
  clearExposedTestCookie(request, response.headers);
  await commitPackSessions(pack, response.headers);
  return response;
}

/**
 * A `POST` request to this route will exit preview mode
 * POST /api/edit Content-Type: application/x-www-form-urlencoded
 */
export async function previewModeAction({
  request,
  pack,
}: PreviewModeArgs): Promise<Response> {
  const {session} = pack;

  if (!(request.method === 'POST' && session)) {
    return finalize(request, pack, json({message: 'Method not allowed'}, 405));
  }

  let slug: string = ROOT_PATH;
  try {
    const body = await request.formData();
    slug = (body.get('slug') as string | null) ?? ROOT_PATH;
  } catch {
    // Not a form body; exit preview and go home
  }
  const redirectTo = isLocalPath(request, slug) ? slug : ROOT_PATH;

  // Clears the session data; the commit in `finalize` then writes an empty
  // `__pack` cookie (as the original did), so the next request starts fresh.
  await session.destroy();

  return finalize(request, pack, redirect(redirectTo));
}

/**
 * A `GET` request to this route will enter preview mode
 */
export async function previewModeLoader({
  request,
  pack,
}: PreviewModeArgs): Promise<Response> {
  if (!pack.session) return new Response('Not Found', {status: 404});

  const {searchParams} = new URL(request.url);

  const token = searchParams.get('token');
  const environment = searchParams.get('environment');
  const path = searchParams.get('path') ?? ROOT_PATH;
  const customizerMeta = searchParams.get('customizerMeta');
  const redirectTo = isLocalPath(request, path) ? path : ROOT_PATH;

  if (!searchParams.has('token')) {
    return finalize(request, pack, unauthorized('Missing token'));
  }

  let validatedToken = false;
  try {
    validatedToken = !!(await pack.isValidEditToken(token));
  } catch (error) {
    console.error('[Pack] Failed to validate edit token:', error);
  }

  if (!validatedToken) {
    return finalize(request, pack, unauthorized('Invalid token'));
  }

  let customizerMetaJson: PackCustomizerMeta | null;
  let previewContext: PackCustomizerMeta['previewContext'] | null = null;

  try {
    customizerMetaJson = customizerMeta
      ? (JSON.parse(customizerMeta) as PackCustomizerMeta)
      : null;

    previewContext = customizerMetaJson?.previewContext || null;
  } catch {
    customizerMetaJson = null;
  }

  // Store preview mode and environment
  pack.session.set('previewEnabled', true);
  pack.session.set('environment', environment);
  pack.session.set('customizerMeta', customizerMetaJson);
  // Always overwrite so a previous preview's drafts/tests don't leak
  pack.session.set('locale', previewContext?.locale ?? null);
  pack.session.set('pageDraft', previewContext?.pageDraft ?? null);
  pack.session.set(
    'siteSettingsDraft',
    previewContext?.siteSettingsDraft ?? null,
  );
  pack.session.set('testHandle', previewContext?.testHandle ?? null);
  pack.session.set(
    'testVariantHandle',
    previewContext?.testVariantHandle ?? null,
  );

  return finalize(request, pack, redirect(redirectTo, 307));
}
