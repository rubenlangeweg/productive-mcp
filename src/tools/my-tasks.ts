import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { Config } from '../config/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const myTasksSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export const myTasksOutputSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    dueDate: z.string().optional(),
    projectId: z.string().optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export async function myTasksTool(
  client: ProductiveAPIClient,
  config: Config,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof myTasksOutputSchema> }> {
  try {
    if (!config.PRODUCTIVE_USER_ID) {
      return {
        content: [{ type: 'text', text: 'User ID not configured. Please set PRODUCTIVE_USER_ID in your environment variables to use this feature.' }],
        structuredContent: { tasks: [], returned: 0 },
      };
    }

    const params = myTasksSchema.parse(args || {});
    const response = await client.listTasks({
      assignee_id: config.PRODUCTIVE_USER_ID,
      status: params.status,
      limit: params.limit,
    });

    if (!response?.data?.length) {
      return {
        content: [{ type: 'text', text: 'You have no tasks assigned to you.' }],
        structuredContent: { tasks: [], returned: 0 },
      };
    }

    const tasks = response.data.filter(t => t?.attributes).map(t => ({
      id: t.id,
      title: t.attributes.title,
      status: t.attributes.closed === true ? 'closed' : 'open',
      ...(t.attributes.due_date ? { dueDate: t.attributes.due_date } : {}),
      ...(t.relationships?.project?.data?.id ? { projectId: t.relationships.project.data.id } : {}),
    }));

    const total = response.meta?.total_count;
    const text = tasks.map(t => {
      const icon = t.status === 'closed' ? '✓' : '○';
      return `${icon} ${t.title} (ID: ${t.id})\n  Status: ${t.status}${t.dueDate ? `\n  Due: ${t.dueDate}` : ''}${t.projectId ? `\n  Project ID: ${t.projectId}` : ''}`;
    }).join('\n\n');

    const n = tasks.length;
    const summary = `You have ${n} task${n !== 1 ? 's' : ''} assigned to you${total ? ` (showing ${n} of ${total})` : ''}:\n\n${text}`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: { tasks, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const myTasksDefinition = {
  name: 'my_tasks',
  description: 'Get tasks assigned to the configured user. Requires PRODUCTIVE_USER_ID to be set.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'My tasks' },
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'closed'], description: 'Filter by task status' },
      limit: { type: 'number', description: 'Number of tasks to return (1-200)', minimum: 1, maximum: 200, default: 30 },
    },
  },
  outputSchema: myTasksOutputSchema.shape,
};
