import type { Requester } from './_requester.js';

/**
 * Legacy all-pages helper used by rb2 tools that need full collections (e.g.
 * `listDeals`, `listAllPeople`). Untyped — callers know the resource shape.
 *
 * Prefer `paginateAll` (in `src/api/paginate.ts`) for new code; this exists
 * to preserve the exact behaviour of the original `client.getAllPages`
 * during the M1 split.
 */
export async function getAllPages<T>(
  request: Requester,
  path: string,
  baseParams: URLSearchParams
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  while (true) {
    baseParams.set('page[number]', page.toString());
    baseParams.set('page[size]', '200');
    const json = await request<{
      data: T[];
      meta?: { total_count?: number };
    }>(`${path}?${baseParams.toString()}`);
    results.push(...json.data);
    const total = json.meta?.total_count ?? results.length;
    if (results.length >= total) break;
    page += 1;
  }
  return results;
}
