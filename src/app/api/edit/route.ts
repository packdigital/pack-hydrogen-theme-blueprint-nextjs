import {createMemoryWithCache} from '~/lib/server/cache';
import {
  createPackForRequest,
  previewModeAction,
  previewModeLoader,
} from '~/lib/pack/server';

/**
 * Pack customizer preview mode (was `app/routes/api.edit.tsx`).
 * GET  /api/edit?token=...&path=...  enter preview mode, 307 to `path`
 * POST /api/edit (form: slug)         exit preview mode, 302 to `slug`
 */

async function withPack(
  request: Request,
  handler: typeof previewModeLoader | typeof previewModeAction,
) {
  try {
    const pack = await createPackForRequest({
      request,
      withCache: createMemoryWithCache(),
    });
    return await handler({request, pack});
  } catch (error) {
    console.error(error);
    return new Response('An unexpected error occurred.', {status: 500});
  }
}

export async function GET(request: Request) {
  return withPack(request, previewModeLoader);
}

export async function POST(request: Request) {
  return withPack(request, previewModeAction);
}
