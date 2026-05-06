import type { Requester } from './_requester.js';
import type {
  ProductiveResponse,
  ProductiveSingleResponse,
  ProductiveTimeEntry,
  ProductiveTimeEntryCreate,
  ProductiveTimeEntryUpdate,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListTimeEntriesParams {
  date?: string;
  after?: string;
  before?: string;
  person_id?: string;
  project_id?: string;
  task_id?: string;
  service_id?: string;
  limit?: number;
  page?: number;
}

export function listTimeEntries(
  request: Requester,
  params?: ListTimeEntriesParams
): Promise<ProductiveResponse<ProductiveTimeEntry>> {
  const qs = new URLSearchParams();
  // Always include relationships for friendly display.
  qs.append('include', 'person,service,task');
  appendFilter(qs, 'date', params?.date);
  appendFilter(qs, 'after', params?.after);
  appendFilter(qs, 'before', params?.before);
  appendFilter(qs, 'person_id', params?.person_id);
  appendFilter(qs, 'project_id', params?.project_id);
  appendFilter(qs, 'task_id', params?.task_id);
  appendFilter(qs, 'service_id', params?.service_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveTimeEntry>>(
    withQuery('time_entries', qs)
  );
}

export function getTimeEntry(
  request: Requester,
  id: string
): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
  return request<ProductiveSingleResponse<ProductiveTimeEntry>>(
    `time_entries/${id}`
  );
}

export function createTimeEntry(
  request: Requester,
  data: ProductiveTimeEntryCreate
): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
  return request<ProductiveSingleResponse<ProductiveTimeEntry>>(
    'time_entries',
    { method: 'POST', body: JSON.stringify(data) }
  );
}

export function updateTimeEntry(
  request: Requester,
  id: string,
  data: ProductiveTimeEntryUpdate
): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
  return request<ProductiveSingleResponse<ProductiveTimeEntry>>(
    `time_entries/${id}`,
    { method: 'PATCH', body: JSON.stringify(data) }
  );
}

export function deleteTimeEntry(
  request: Requester,
  id: string
): Promise<void> {
  return request<void>(`time_entries/${id}`, { method: 'DELETE' });
}
