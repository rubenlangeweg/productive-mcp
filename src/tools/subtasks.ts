import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listSubtasksSchema = z.object({
  parent_task_id: z.string().min(1, 'Parent task ID is required'),
  limit: z.number().min(1).max(200).default(50).optional(),
});

export async function listSubtasksTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listSubtasksSchema.parse(args);

    const response = await client.listSubtasks(params.parent_task_id, { limit: params.limit });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{ type: 'text', text: `No subtasks found for task ${params.parent_task_id}.` }],
      };
    }

    const items = response.data.map(task => {
      const statusText = task.attributes.closed === false ? 'open' : task.attributes.closed === true ? 'closed' : 'unknown';
      const assigneeId = task.relationships?.assignee?.data?.id;
      return `• ${task.attributes.title} (ID: ${task.id})
  Status: ${statusText}
  ${task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date'}
  ${assigneeId ? `Assignee ID: ${assigneeId}` : 'Unassigned'}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Subtasks of task ${params.parent_task_id} (${response.data.length} found):\n\n${items}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listSubtasksDefinition = {
  name: 'list_subtasks',
  description: 'List all subtasks (child tasks) of a given parent task in Productive.io.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      parent_task_id: {
        type: 'string',
        description: 'The ID of the parent task',
      },
      limit: {
        type: 'number',
        description: 'Number of subtasks to return (1-200, default 50)',
        minimum: 1,
        maximum: 200,
        default: 50,
      },
    },
    required: ['parent_task_id'],
  },
};
