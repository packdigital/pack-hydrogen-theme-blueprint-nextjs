/**
 * Port of `getPaginationVariables` from the React Router `@shopify/hydrogen`
 * (not part of the framework-agnostic toolkit). Reads `cursor`/`direction`
 * (or `${namespace}_cursor`/`${namespace}_direction`) search params and
 * returns Storefront API connection variables.
 */
export function getPaginationVariables(
  request: Request,
  options: {pageBy: number; namespace?: string} = {pageBy: 20},
):
  | {last: number; startCursor: string | null}
  | {first: number; endCursor: string | null} {
  if (typeof request?.url === 'undefined') {
    throw new Error(
      'getPaginationVariables must be called with the Request object passed to your loader function',
    );
  }
  const {pageBy, namespace = ''} = options;
  const searchParams = new URLSearchParams(new URL(request.url).search);
  const cursorParam = namespace ? `${namespace}_cursor` : 'cursor';
  const directionParam = namespace ? `${namespace}_direction` : 'direction';
  const cursor = searchParams.get(cursorParam) ?? undefined;
  const direction =
    searchParams.get(directionParam) === 'previous' ? 'previous' : 'next';
  const isPrevious = direction === 'previous';
  const prevPage = {
    last: pageBy,
    startCursor: cursor ?? null,
  };
  const nextPage = {
    first: pageBy,
    endCursor: cursor ?? null,
  };
  return isPrevious ? prevPage : nextPage;
}
