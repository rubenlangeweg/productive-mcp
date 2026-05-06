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

// ─── create_subtask ──────────────────────────────────────────────────────────

const createSubtaskSchema = z.object({
  parent_task_id: z.string().min(1, 'Parent task ID is required'),
  title: z.string().min(1, 'Title is required'),
  project_id: z.string().min(1, 'Project ID is required'),
  task_list_id: z.string().min(1, 'Task list ID is required'),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
  description: z.string().optional(),
});

interface SubtaskRelationships {
  parent: { data: { id: string; type: 'tasks' } };
  project?: { data: { id: string; type: 'projects' } };
  task_list?: { data: { id: string; type: 'task_lists' } };
  assignee?: { data: { id: string; type: 'people' } };
}

export async function createSubtaskTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createSubtaskSchema.parse(args);

    let assigneeId = params.assignee_id;
    if (assigneeId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured in environment'
        );
      }
      assigneeId = config.PRODUCTIVE_USER_ID;
    }

    const relationships: SubtaskRelationships = {
      parent: { data: { id: params.parent_task_id, type: 'tasks' } },
    };
    if (params.project_id) {
      relationships.project = { data: { id: params.project_id, type: 'projects' } };
    }
    if (params.task_list_id) {
      relationships.task_list = { data: { id: params.task_list_id, type: 'task_lists' } };
    }
    if (assigneeId) {
      relationships.assignee = { data: { id: assigneeId, type: 'people' } };
    }

    const attributes: { title: string; description?: string; due_date?: string } = {
      title: params.title,
    };
    if (params.description !== undefined) attributes.description = params.description;
    if (params.due_date !== undefined) attributes.due_date = params.due_date;

    const response = await client.createTask({
      data: {
        type: 'tasks',
        attributes,
        // Cast: ProductiveTaskCreate's relationships type doesn't include
        // `parent`, but the API accepts it. Use a structural cast rather than
        // widening the public type.
        relationships: relationships as unknown as {
          project?: { data: { id: string; type: 'projects' } };
          assignee?: { data: { id: string; type: 'people' } };
        },
      },
    });

    const t = response.data;
    let text = `Subtask created!\n`;
    text += `Title: ${t.attributes.title} (ID: ${t.id})\n`;
    text += `Parent task ID: ${params.parent_task_id}`;
    if (params.project_id) text += `\nProject ID: ${params.project_id}`;
    if (params.task_list_id) text += `\nTask List ID: ${params.task_list_id}`;
    if (assigneeId) {
      text += `\nAssignee ID: ${assigneeId}`;
      if (params.assignee_id === 'me') text += ' (me)';
    }
    if (t.attributes.due_date) text += `\nDue date: ${t.attributes.due_date}`;
    if (t.attributes.created_at) text += `\nCreated: ${t.attributes.created_at}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const createSubtaskDefinition = {
  name: 'create_subtask',
  description: 'Create a new subtask under a parent task. If PRODUCTIVE_USER_ID is configured, "me" can be used for assignee_id.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      parent_task_id: { type: 'string', description: 'The ID of the parent task' },
      title: { type: 'string', description: 'Subtask title' },
      project_id: { type: 'string', description: 'Project ID for the subtask (required by API)' },
      task_list_id: { type: 'string', description: 'Task list ID for the subtask (required by API)' },
      assignee_id: { type: 'string', description: 'Optional assignee ID. Use "me" for the configured user.' },
      due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format' },
      description: { type: 'string', description: 'Optional subtask description' },
    },
    required: ['parent_task_id', 'title', 'project_id', 'task_list_id'],
  },
};
