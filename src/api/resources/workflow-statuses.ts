import type { Requester } from './_requester.js';
import type {
  ProductiveResponse,
  ProductiveWorkflowStatus,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListWorkflowStatusesParams {
  workflow_id?: string;
  category_id?: number;
  limit?: number;
  page?: number;
}

export function listWorkflowStatuses(
  request: Requester,
  params?: ListWorkflowStatusesParams
): Promise<ProductiveResponse<ProductiveWorkflowStatus>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'workflow_id', params?.workflow_id);
  if (params?.category_id !== undefined) {
    qs.append('filter[category_id]', params.category_id.toString());
  }
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveWorkflowStatus>>(
    withQuery('workflow_statuses', qs)
  );
}
