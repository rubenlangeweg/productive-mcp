import type { Requester } from './_requester.js';
import type {
  ProductivePerson,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListPeopleParams {
  company_id?: string;
  project_id?: string;
  is_active?: boolean;
  email?: string;
  limit?: number;
  page?: number;
}

export function listPeople(
  request: Requester,
  params?: ListPeopleParams
): Promise<ProductiveResponse<ProductivePerson>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'company_id', params?.company_id);
  appendFilter(qs, 'project_id', params?.project_id);
  if (params?.is_active !== undefined) {
    qs.append('filter[is_active]', params.is_active.toString());
  }
  appendFilter(qs, 'email', params?.email);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductivePerson>>(withQuery('people', qs));
}

export function getPerson(
  request: Requester,
  personId: string
): Promise<ProductiveSingleResponse<ProductivePerson>> {
  return request<ProductiveSingleResponse<ProductivePerson>>(
    `people/${personId}`
  );
}
