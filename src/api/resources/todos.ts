import type { Requester } from './_requester.js';
import type {
  ProductiveResponse,
  ProductiveSingleResponse,
  ProductiveTodo,
  ProductiveTodoCreate,
} from '../types.js';

export function listTodos(
  request: Requester,
  taskId: string
): Promise<ProductiveResponse<ProductiveTodo>> {
  return request<ProductiveResponse<ProductiveTodo>>(
    `todos?filter[task_id]=${encodeURIComponent(taskId)}`
  );
}

export function getTodo(
  request: Requester,
  todoId: string
): Promise<ProductiveSingleResponse<ProductiveTodo>> {
  return request<ProductiveSingleResponse<ProductiveTodo>>(
    `todos/${todoId}`
  );
}

export function createTodo(
  request: Requester,
  todoData: ProductiveTodoCreate
): Promise<ProductiveSingleResponse<ProductiveTodo>> {
  return request<ProductiveSingleResponse<ProductiveTodo>>('todos', {
    method: 'POST',
    body: JSON.stringify(todoData),
  });
}

export function updateTodo(
  request: Requester,
  todoId: string,
  attrs: { description?: string; closed?: boolean }
): Promise<ProductiveSingleResponse<ProductiveTodo>> {
  return request<ProductiveSingleResponse<ProductiveTodo>>(
    `todos/${todoId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'todos', id: todoId, attributes: attrs },
      }),
    }
  );
}

export function deleteTodo(
  request: Requester,
  todoId: string
): Promise<void> {
  return request<void>(`todos/${todoId}`, { method: 'DELETE' });
}
