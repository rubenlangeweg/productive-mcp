import type { Requester } from './_requester.js';
import type { ProductiveProject, ProductiveResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListProjectsParams {
  status?: 'active' | 'archived';
  company_id?: string;
  limit?: number;
  page?: number;
}

export function listProjects(
  request: Requester,
  params?: ListProjectsParams
): Promise<ProductiveResponse<ProductiveProject>> {
  const qs = new URLSearchParams();
  if (params?.status) {
    // Productive `filter[status]` takes integers: 1=active, 2=archived.
    qs.append('filter[status]', params.status === 'active' ? '1' : '2');
  }
  appendFilter(qs, 'company_id', params?.company_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveProject>>(withQuery('projects', qs));
}
