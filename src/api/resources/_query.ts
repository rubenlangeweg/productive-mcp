/**
 * Tiny helpers for building JSON:API query strings.
 * Kept resource-agnostic so every per-resource module can call them.
 */

/** Append `page[size]` and `page[number]` from optional `limit` / `page` args. */
export function appendPagination(
  qs: URLSearchParams,
  params?: { limit?: number; page?: number }
): void {
  if (params?.limit !== undefined) {
    qs.append('page[size]', params.limit.toString());
  }
  if (params?.page !== undefined) {
    qs.append('page[number]', params.page.toString());
  }
}

/** Build a `path?qs` URL fragment from the path and search params. */
export function withQuery(path: string, qs: URLSearchParams): string {
  const s = qs.toString();
  return s.length > 0 ? `${path}?${s}` : path;
}

/** Append a `filter[name]=value` only when value is defined. */
export function appendFilter(
  qs: URLSearchParams,
  name: string,
  value: string | number | boolean | undefined
): void {
  if (value === undefined || value === null || value === '') return;
  qs.append(`filter[${name}]`, String(value));
}
