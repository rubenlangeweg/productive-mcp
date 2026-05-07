import type { Requester } from './_requester.js';
import type { ProductiveDeal, ProductiveResponse, ProductiveSingleResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListProjectDealsParams {
  project_id: string;
  /** 1=deal, 2=budget */
  budget_type?: number;
  limit?: number;
  page?: number;
}

export function getDeal(
  request: Requester,
  dealId: string
): Promise<ProductiveSingleResponse<ProductiveDeal>> {
  return request<ProductiveSingleResponse<ProductiveDeal>>(`deals/${dealId}?include=project`);
}

export function listProjectDeals(
  request: Requester,
  params: ListProjectDealsParams
): Promise<ProductiveResponse<ProductiveDeal>> {
  const qs = new URLSearchParams();
  qs.append('include', 'project');
  qs.append('filter[project_id]', params.project_id);
  if (params.budget_type !== undefined) {
    qs.append('filter[budget_type]', params.budget_type.toString());
  }
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveDeal>>(withQuery('deals', qs));
}

/** All-pages iteration of `/deals` for org-wide budget views. Untyped result. */
export async function listDealsAllPages(
  request: Requester,
  params?: { project_id?: string }
): Promise<unknown[]> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  return paginateRaw(request, 'deals', qs);
}

async function paginateRaw(
  request: Requester,
  path: string,
  qs: URLSearchParams
): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 1;
  while (true) {
    qs.set('page[number]', page.toString());
    qs.set('page[size]', '200');
    const json = await request<{
      data: unknown[];
      meta?: { total_count?: number };
    }>(`${path}?${qs.toString()}`);
    out.push(...json.data);
    const total = json.meta?.total_count ?? out.length;
    if (out.length >= total) break;
    page += 1;
  }
  return out;
}
