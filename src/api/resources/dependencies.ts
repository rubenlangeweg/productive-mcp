import type { Requester } from './_requester.js';
import type {
  ProductiveDependency,
  ProductiveDependencyCreate,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';

export function listTaskDependencies(
  request: Requester,
  taskId: string
): Promise<ProductiveResponse<ProductiveDependency>> {
  return request<ProductiveResponse<ProductiveDependency>>(
    `task_dependencies?filter[task_id]=${encodeURIComponent(taskId)}&include=task`
  );
}

export function getTaskDependency(
  request: Requester,
  dependencyId: string
): Promise<ProductiveSingleResponse<ProductiveDependency>> {
  return request<ProductiveSingleResponse<ProductiveDependency>>(
    `task_dependencies/${dependencyId}`
  );
}

export function addTaskDependency(
  request: Requester,
  depData: ProductiveDependencyCreate
): Promise<ProductiveSingleResponse<ProductiveDependency>> {
  return request<ProductiveSingleResponse<ProductiveDependency>>(
    'task_dependencies',
    { method: 'POST', body: JSON.stringify(depData) }
  );
}

export function removeTaskDependency(
  request: Requester,
  dependencyId: string
): Promise<void> {
  return request<void>(`task_dependencies/${dependencyId}`, {
    method: 'DELETE',
  });
}
