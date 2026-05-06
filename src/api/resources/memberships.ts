import type { Requester } from './_requester.js';
import type { ProductiveMembership, ProductiveResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListMembershipsParams {
  project_id?: string;
  person_id?: string;
  limit?: number;
  page?: number;
}

export function listMemberships(
  request: Requester,
  params?: ListMembershipsParams
): Promise<ProductiveResponse<ProductiveMembership>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  appendFilter(qs, 'person_id', params?.person_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveMembership>>(
    withQuery('memberships', qs)
  );
}
