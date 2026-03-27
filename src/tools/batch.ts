import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const taskInputSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  project_id: z.string().optional(),
  board_id: z.string().optional(),
  task_list_id: z.string().optional(),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
});

const createTasksBatchSchema = z.object({
  tasks: z.array(taskInputSchema).min(1, 'At least one task is required').max(20, 'Maximum 20 tasks per batch'),
  project_id: z.string().optional(),
  board_id: z.string().optional(),
  task_list_id: z.string().optional(),
});

export async function createTasksBatchTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTasksBatchSchema.parse(args);

    const results = await Promise.allSettled(
      params.tasks.map(async task => {
        // Inherit shared project/board/task_list if not specified on individual task
        const projectId = task.project_id ?? params.project_id;
        const boardId = task.board_id ?? params.board_id;
        const taskListId = task.task_list_id ?? params.task_list_id;

        let assigneeId = task.assignee_id;
        if (assigneeId === 'me') {
          if (!config?.PRODUCTIVE_USER_ID) {
            throw new Error('Cannot use "me" — PRODUCTIVE_USER_ID is not configured');
          }
          assigneeId = config.PRODUCTIVE_USER_ID;
        }

        const taskData = {
          data: {
            type: 'tasks' as const,
            attributes: {
              title: task.title,
              description: task.description,
              due_date: task.due_date,
              status: 1,
            },
            relationships: {} as Record<string, { data: { id: string; type: string } }>,
          },
        };

        if (projectId) taskData.data.relationships['project'] = { data: { id: projectId, type: 'projects' } };
        if (boardId) taskData.data.relationships['board'] = { data: { id: boardId, type: 'boards' } };
        if (taskListId) taskData.data.relationships['task_list'] = { data: { id: taskListId, type: 'task_lists' } };
        if (assigneeId) taskData.data.relationships['assignee'] = { data: { id: assigneeId, type: 'people' } };

        return client.createTask(taskData);
      })
    );

    const created: string[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      const taskTitle = params.tasks[index]?.title ?? `Task ${index + 1}`;
      if (result.status === 'fulfilled') {
        created.push(`  ✓ "${taskTitle}" (ID: ${result.value.data.id})`);
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        failed.push(`  ✗ "${taskTitle}" — ${reason}`);
      }
    });

    let text = `Batch task creation complete: ${created.length} created, ${failed.length} failed.\n`;
    if (created.length > 0) text += `\nCreated:\n${created.join('\n')}`;
    if (failed.length > 0) text += `\n\nFailed:\n${failed.join('\n')}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const createTasksBatchDefinition = {
  name: 'create_tasks_batch',
  description: 'Create multiple tasks at once in Productive.io. Each task is created independently — failures on individual tasks do not abort the others. Shared project/board/task_list can be set at the top level and overridden per task.',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Array of tasks to create (max 20)',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title (required)' },
            description: { type: 'string', description: 'Task description' },
            project_id: { type: 'string', description: 'Override shared project_id for this task' },
            board_id: { type: 'string', description: 'Override shared board_id for this task' },
            task_list_id: { type: 'string', description: 'Override shared task_list_id for this task' },
            assignee_id: { type: 'string', description: 'Person ID to assign. Use "me" if PRODUCTIVE_USER_ID is configured.' },
            due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          },
          required: ['title'],
        },
        minItems: 1,
        maxItems: 20,
      },
      project_id: { type: 'string', description: 'Default project ID for all tasks (can be overridden per task)' },
      board_id: { type: 'string', description: 'Default board ID for all tasks (can be overridden per task)' },
      task_list_id: { type: 'string', description: 'Default task list ID for all tasks (can be overridden per task)' },
    },
    required: ['tasks'],
  },
};
