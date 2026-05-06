import type { Requester } from './_requester.js';
import type { ProductiveResponse, ProductiveService } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListServicesParams {
  company_id?: string;
  limit?: number;
  page?: number;
}

export function listServices(
  request: Requester,
  params?: ListServicesParams
): Promise<ProductiveResponse<ProductiveService>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'company_id', params?.company_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveService>>(
    withQuery('services', qs)
  );
}

export interface ListDealServicesParams {
  deal_id: string;
  limit?: number;
  page?: number;
}

export function listDealServices(
  request: Requester,
  params: ListDealServicesParams
): Promise<ProductiveResponse<ProductiveService>> {
  const qs = new URLSearchParams();
  qs.append('filter[deal_id]', params.deal_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveService>>(
    withQuery('services', qs)
  );
}

/** All-pages iteration of `/services?filter[deal_id]=...`. Untyped result. */
export async function listServicesForDealAllPages(
  request: Requester,
  dealId: string
): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 1;
  const qs = new URLSearchParams({ 'filter[deal_id]': dealId });
  while (true) {
    qs.set('page[number]', page.toString());
    qs.set('page[size]', '200');
    const json = await request<{
      data: unknown[];
      meta?: { total_count?: number };
    }>(`services?${qs.toString()}`);
    out.push(...json.data);
    const total = json.meta?.total_count ?? out.length;
    if (out.length >= total) break;
    page += 1;
  }
  return out;
}
