import type { Requester } from './_requester.js';
import type { ProductiveBooking, ProductiveResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListBookingsParams {
  person_id?: string;
  project_id?: string;
  /** Tool-side unified date filter (YYYY-MM-DD). */
  after?: string;
  before?: string;
  limit?: number;
  page?: number;
}

export function listBookings(
  request: Requester,
  params?: ListBookingsParams
): Promise<ProductiveResponse<ProductiveBooking>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'person_id', params?.person_id);
  appendFilter(qs, 'project_id', params?.project_id);
  if (params?.after) {
    qs.append('filter[after]', params.after);
  }
  if (params?.before) {
    qs.append('filter[before]', params.before);
  }
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveBooking>>(
    withQuery('bookings', qs)
  );
}

interface JsonApiEntity {
  id: string;
  type: string;
  [k: string]: unknown;
}

/**
 * All-pages bookings fetch with the `person,service.deal.project` include
 * chain. Used by rb2 resource-plan/overbooked tools to resolve names.
 */
export async function listBookingsWithIncludedAllPages(
  request: Requester,
  params?: { after?: string; before?: string; person_id?: string }
): Promise<{ bookings: JsonApiEntity[]; included: JsonApiEntity[] }> {
  const qs = new URLSearchParams();
  if (params?.after) qs.append('filter[after]', params.after);
  if (params?.before) qs.append('filter[before]', params.before);
  appendFilter(qs, 'person_id', params?.person_id);
  qs.set('include', 'person,service.deal.project');
  qs.set('page[size]', '200');

  const bookings: JsonApiEntity[] = [];
  const includedMap: Record<string, JsonApiEntity> = {};
  let page = 1;
  while (true) {
    qs.set('page[number]', page.toString());
    const json = await request<{
      data: JsonApiEntity[];
      included?: JsonApiEntity[];
      meta?: { total_count?: number };
    }>(`bookings?${qs.toString()}`);
    bookings.push(...json.data);
    for (const item of json.included ?? []) {
      includedMap[`${item.type}:${item.id}`] = item;
    }
    const total = json.meta?.total_count ?? bookings.length;
    if (bookings.length >= total) break;
    page += 1;
  }
  return { bookings, included: Object.values(includedMap) };
}
