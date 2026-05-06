import type { Requester } from './_requester.js';
import type {
  ProductivePage,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListPagesParams {
  project_id?: string;
  limit?: number;
  page?: number;
}

export function listPages(
  request: Requester,
  params?: ListPagesParams
): Promise<ProductiveResponse<ProductivePage>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductivePage>>(withQuery('pages', qs));
}

export function getPage(
  request: Requester,
  pageId: string
): Promise<ProductiveSingleResponse<ProductivePage>> {
  return request<ProductiveSingleResponse<ProductivePage>>(`pages/${pageId}`);
}
