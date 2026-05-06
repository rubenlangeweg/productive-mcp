import type { Requester } from './_requester.js';
import type { ProductiveCompany, ProductiveResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListCompaniesParams {
  status?: 'active' | 'archived';
  limit?: number;
  page?: number;
}

export function listCompanies(
  request: Requester,
  params?: ListCompaniesParams
): Promise<ProductiveResponse<ProductiveCompany>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'status', params?.status);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveCompany>>(withQuery('companies', qs));
}
