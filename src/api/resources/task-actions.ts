import type { Requester } from './_requester.js';

/** Reposition a task within its task list. */
export async function repositionTask(
  request: Requester,
  taskId: string,
  attributes: {
    move_before_id?: string;
    move_after_id?: string;
    placement?: number;
  }
): Promise<{ success: boolean; taskId: string; message: string }> {
  await request<unknown>(`tasks/${taskId}/reposition`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'tasks',
        attributes: { ...attributes },
      },
    }),
  });
  return {
    success: true,
    taskId,
    message: `Task ${taskId} repositioned successfully`,
  };
}
