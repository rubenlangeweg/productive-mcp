import type { Requester } from './_requester.js';
import type {
  ProductiveResponse,
  ProductiveSingleResponse,
  ProductiveTask,
  ProductiveTaskCreate,
  ProductiveTaskUpdate,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListTasksParams {
  project_id?: string;
  assignee_id?: string;
  status?: 'open' | 'closed';
  limit?: number;
  page?: number;
}

export function listTasks(
  request: Requester,
  params?: ListTasksParams
): Promise<ProductiveResponse<ProductiveTask>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  appendFilter(qs, 'assignee_id', params?.assignee_id);
  if (params?.status) {
    // Productive POST takes status:number; list filter[status] also expects
    // 1=open, 2=closed.
    qs.append('filter[status]', params.status === 'open' ? '1' : '2');
  }
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveTask>>(withQuery('tasks', qs));
}

export function getTask(
  request: Requester,
  taskId: string,
  options?: { include?: string }
): Promise<ProductiveSingleResponse<ProductiveTask>> {
  const qs = options?.include
    ? `?include=${encodeURIComponent(options.include)}`
    : '';
  return request<ProductiveSingleResponse<ProductiveTask>>(
    `tasks/${taskId}${qs}`
  );
}

export function createTask(
  request: Requester,
  taskData: ProductiveTaskCreate
): Promise<ProductiveSingleResponse<ProductiveTask>> {
  return request<ProductiveSingleResponse<ProductiveTask>>('tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
}

export function updateTask(
  request: Requester,
  taskId: string,
  taskData: ProductiveTaskUpdate
): Promise<ProductiveSingleResponse<ProductiveTask>> {
  return request<ProductiveSingleResponse<ProductiveTask>>(`tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(taskData),
  });
}

export function listSubtasks(
  request: Requester,
  parentTaskId: string,
  params?: { limit?: number }
): Promise<ProductiveResponse<ProductiveTask>> {
  const qs = new URLSearchParams();
  qs.append('filter[parent_task_id]', parentTaskId);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveTask>>(`tasks?${qs.toString()}`);
}
