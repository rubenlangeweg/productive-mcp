/**
 * JSON:API auto-pagination helper.
 *
 * Productive's collection endpoints return a `meta.total_count` and a
 * `links.next` URL. `paginateAll` follows the `next` link until exhausted,
 * `meta.total_count` is reached, or the configured cap fires (whichever
 * comes first). Returns the concatenated `data` array.
 *
 * NOTE: every page is fetched with the same query parameters as the first
 * page (the `next` link already encodes pagination state).
 */
import type { Core, JsonApiList, JsonApiResource } from './core.js';

export interface PaginateOptions {
  /** Hard ceiling on total items returned. Default 500. */
  cap?: number;
  /**
   * If provided, override the `page[size]` of the first request. Defaults to
   * 200 (Productive's typical max_page_size).
   */
  pageSize?: number;
}

const DEFAULT_CAP = 500;
const DEFAULT_PAGE_SIZE = 200;

/**
 * Walk the entire pagination chain for `path?<query>` and return every
 * resource. Stops when:
 *   1. `links.next` is missing or null
 *   2. The collected items reach the cap
 *   3. `meta.total_count` is exhausted
 */
export async function paginateAll<T extends JsonApiResource = JsonApiResource>(
  core: Core,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
  options: PaginateOptions = {}
): Promise<T[]> {
  const cap = options.cap ?? DEFAULT_CAP;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  // Ensure page[size] is set so we don't waste round-trips on tiny pages.
  if (!query.has('page[size]')) {
    query.set('page[size]', String(pageSize));
  }

  let collected: T[] = [];
  let nextPath: string | null = path;
  let nextQuery: URLSearchParams | undefined = query;
  let total: number | undefined;

  // Safety net against infinite loops if the API emits a self-referential `next`.
  let iterations = 0;
  const maxIterations = Math.max(1, Math.ceil(cap / pageSize) + 5);

  while (nextPath && iterations < maxIterations) {
    iterations += 1;
    const page: JsonApiList<T> =
      nextQuery !== undefined
        ? await core.list<T>(nextPath, nextQuery)
        : await core.request<JsonApiList<T>>(nextPath);

    collected = collected.concat(page.data);
    if (page.meta?.total_count !== undefined) {
      total = page.meta.total_count;
    }

    if (collected.length >= cap) {
      collected = collected.slice(0, cap);
      break;
    }
    if (total !== undefined && collected.length >= total) {
      break;
    }

    const nextLink = page.links?.next;
    if (!nextLink) break;
    nextPath = nextLink;
    // The next URL already encodes the query params; pass `undefined` so
    // `core.list` does not append anything.
    nextQuery = undefined;
  }

  return collected;
}
