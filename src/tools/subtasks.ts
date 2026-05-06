import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listSubtasksSchema = z.object({
  parent_task_id: z.string().min(1, 'Parent task ID is required'),
  limit: z.number().min(1).max(200).default(50).optional(),
});

export const listSubtasksOutputSchema = z.object({
  subtasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    dueDate: z.string().optional(),
    assigneeId: z.string().optional(),
  })),
  returned: z.number(),
  parentTaskId: z.string(),
});

export async function listSubtasksTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listSubtasksOutputSchema> }> {
  try {
    const params = listSubtasksSchema.parse(args);
    const response = await client.listSubtasks(params.parent_task_id, { limit: params.limit });

    if (!response.data?.length) {
      return {
        content: [{ type: 'text', text: `No subtasks found for task ${params.parent_task_id}.` }],
        structuredContent: { subtasks: [], returned: 0, parentTaskId: params.parent_task_id },
      };
    }

    const subtasks = response.data.map(t => ({
      id: t.id,
      title: t.attributes.title,
      status: t.attributes.closed === true ? 'closed' : 'open',
      ...(t.attributes.due_date ? { dueDate: t.attributes.due_date } : {}),
      ...(t.relationships?.assignee?.data?.id ? { assigneeId: t.relationships.assignee.data.id } : {}),
    }));

    const text = subtasks.map(t =>
      `• ${t.title} (ID: ${t.id})\n  Status: ${t.status}${t.dueDate ? `\n  Due: ${t.dueDate}` : ''}${t.assigneeId ? `\n  Assignee ID: ${t.assigneeId}` : ''}`
    ).join('\n\n');

    const n = subtasks.length;
    return {
      content: [{ type: 'text', text: `Subtasks of task ${params.parent_task_id} (${n} found):\n\n${text}` }],
      structuredContent: { subtasks, returned: n, parentTaskId: params.parent_task_id },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listSubtasksDefinition = {
  name: 'list_subtasks',
  description: 'List all subtasks (child tasks) of a given parent task in Productive.io.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List subtasks' },
  inputSchema: {
    type: 'object',
    properties: {
      parent_task_id: { type: 'string', description: 'The ID of the parent task' },
      limit: { type: 'number', description: 'Number of subtasks to return (1-200, default 50)', minimum: 1, maximum: 200, default: 50 },
    },
    required: ['parent_task_id'],
  },
  outputSchema: listSubtasksOutputSchema.shape,
};
