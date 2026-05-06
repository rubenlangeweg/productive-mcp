import type { Requester } from './_requester.js';
import type { ProductiveActivity, ProductiveResponse } from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListActivitiesParams {
  task_id?: string;
  project_id?: string;
  person_id?: string;
  item_type?: string;
  event?: string;
  /** ISO date or datetime, depending on the field. */
  after?: string;
  before?: string;
  limit?: number;
  page?: number;
}

export function listActivities(
  request: Requester,
  params?: ListActivitiesParams
): Promise<ProductiveResponse<ProductiveActivity>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'task_id', params?.task_id);
  appendFilter(qs, 'project_id', params?.project_id);
  appendFilter(qs, 'person_id', params?.person_id);
  appendFilter(qs, 'item_type', params?.item_type);
  appendFilter(qs, 'event', params?.event);
  appendFilter(qs, 'after', params?.after);
  appendFilter(qs, 'before', params?.before);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveActivity>>(
    withQuery('activities', qs)
  );
}
