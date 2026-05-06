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

export function getTaskList(
  request: Requester,
  taskListId: string
): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
  return request<ProductiveSingleResponse<ProductiveTaskList>>(
    `task_lists/${taskListId}`
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

export function updateTaskList(
  request: Requester,
  taskListId: string,
  attrs: { name: string }
): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
  return request<ProductiveSingleResponse<ProductiveTaskList>>(
    `task_lists/${taskListId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'task_lists', id: taskListId, attributes: attrs },
      }),
    }
  );
}

export function archiveTaskList(
  request: Requester,
  taskListId: string
): Promise<void> {
  return request<void>(`task_lists/${taskListId}`, { method: 'DELETE' });
}

export function restoreTaskList(
  request: Requester,
  taskListId: string
): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
  return request<ProductiveSingleResponse<ProductiveTaskList>>(
    `task_lists/${taskListId}/restore`,
    { method: 'POST' }
  );
}

export function repositionTaskList(
  request: Requester,
  taskListId: string,
  attrs: { move_before_id?: string }
): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
  return request<ProductiveSingleResponse<ProductiveTaskList>>(
    `task_lists/${taskListId}/reposition`,
    {
      method: 'POST',
      body: JSON.stringify({
        data: { type: 'task_lists', id: taskListId, attributes: attrs },
      }),
    }
  );
}
