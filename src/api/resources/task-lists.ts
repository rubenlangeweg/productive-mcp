import type { Requester } from './_requester.js';
import type {
  ProductiveResponse,
  ProductiveSingleResponse,
  ProductiveTaskList,
  ProductiveTaskListCreate,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListTaskListsParams {
  board_id?: string;
  limit?: number;
  page?: number;
}

export function listTaskLists(
  request: Requester,
  params?: ListTaskListsParams
): Promise<ProductiveResponse<ProductiveTaskList>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'board_id', params?.board_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveTaskList>>(
    withQuery('task_lists', qs)
  );
}

export function createTaskList(
  request: Requester,
  taskListData: ProductiveTaskListCreate
): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
  return request<ProductiveSingleResponse<ProductiveTaskList>>('task_lists', {
    method: 'POST',
    body: JSON.stringify(taskListData),
  });
}
