import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const ListTaskListsSchema = z.object({
  board_id: z.string().optional().describe('Filter task lists by board ID'),
  limit: z.number().optional().default(30).describe('Number of task lists to return (max 200)'),
});

export async function listTaskLists(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = ListTaskListsSchema.parse(args || {});
    
    const response = await client.listTaskLists({
      board_id: params.board_id,
      limit: params.limit,
    });
    
    if (!response || !response.data || response.data.length === 0) {
      const filterText = params.board_id ? ` for board ${params.board_id}` : '';
      return {
        content: [{
          type: 'text',
          text: `No task lists found${filterText}`,
        }],
      };
    }
    
    const taskListsText = response.data.filter(taskList => taskList && taskList.attributes).map(taskList => {
      let text = `Task List: ${taskList.attributes.name} (ID: ${taskList.id})`;
      if (taskList.attributes.description) {
        text += `\nDescription: ${taskList.attributes.description}`;
      }
      if (taskList.attributes.position !== undefined) {
        text += `\nPosition: ${taskList.attributes.position}`;
      }
      if (taskList.relationships?.board?.data?.id) {
        text += `\nBoard ID: ${taskList.relationships.board.data.id}`;
      }
      return text;
    }).join('\n\n');
    
    return {
      content: [{
        type: 'text',
        text: taskListsText,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while fetching task lists'
    );
  }
}

export const listTaskListsTool = {
  name: 'list_task_lists',
  description: 'Get a list of task lists from Productive.io. Task lists organize tasks within boards.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'Filter task lists by board ID',
      },
      limit: {
        type: 'number',
        description: 'Number of task lists to return (max 200)',
        default: 30,
      },
    },
  },
};

const CreateTaskListSchema = z.object({
  board_id: z.string().describe('The ID of the board to create the task list in'),
  project_id: z.string().describe('The ID of the project'),
  name: z.string().describe('Name of the task list'),
  description: z.string().optional().describe('Description of the task list'),
});

export async function createTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = CreateTaskListSchema.parse(args);
    
    const taskListData = {
      data: {
        type: 'task_lists' as const,
        attributes: {
          name: params.name,
          ...(params.description && { description: params.description }),
          position: 0,
          project_id: params.project_id,
        },
        relationships: {
          board: {
            data: {
              id: params.board_id,
              type: 'boards' as const,
            },
          },
        },
      },
    };
    
    // Debug: Log the request data
    console.error('Creating task list with data:', JSON.stringify(taskListData, null, 2));
    
    const response = await client.createTaskList(taskListData);
    
    let text = `Task list created successfully!\n`;
    text += `Name: ${response.data.attributes.name} (ID: ${response.data.id})`;
    if (response.data.attributes.description) {
      text += `\nDescription: ${response.data.attributes.description}`;
    }
    text += `\nBoard ID: ${params.board_id}`;
    if (response.data.attributes.created_at) {
      text += `\nCreated at: ${response.data.attributes.created_at}`;
    }
    
    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `API error: ${error.message}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      'Unknown error occurred while creating task list'
    );
  }
}

export const createTaskListTool = {
  name: 'create_task_list',
  description: 'Create a new task list in a Productive.io board. Task lists help organize tasks within boards.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      board_id: {
        type: 'string',
        description: 'The ID of the board to create the task list in',
      },
      project_id: {
        type: 'string',
        description: 'The ID of the project',
      },
      name: {
        type: 'string',
        description: 'Name of the task list',
      },
      description: {
        type: 'string',
        description: 'Description of the task list',
      },
    },
    required: ['board_id', 'project_id', 'name'],
  },
};

// ─── Additional task list tools ──────────────────────────────────────────────

const getTaskListSchema = z.object({
  task_list_id: z.string().min(1, 'Task list ID is required'),
});

const updateTaskListSchema = z.object({
  task_list_id: z.string().min(1, 'Task list ID is required'),
  name: z.string().min(1, 'Name is required'),
});

const taskListIdOnlySchema = z.object({
  task_list_id: z.string().min(1, 'Task list ID is required'),
});

const repositionTaskListSchema = z.object({
  task_list_id: z.string().min(1, 'Task list ID is required'),
  move_before_id: z.string().optional(),
});

function handleTaskListError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
    );
  }
  if (error instanceof Error) {
    throw new McpError(ErrorCode.InternalError, `API error: ${error.message}`);
  }
  throw new McpError(ErrorCode.InternalError, 'Unknown error occurred');
}

export async function getTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTaskListSchema.parse(args);
    const response = await client.getTaskList(params.task_list_id);
    const tl = response.data;
    let text = `Task List: ${tl.attributes.name} (ID: ${tl.id})\n`;
    if (tl.attributes.description) text += `Description: ${tl.attributes.description}\n`;
    if (tl.attributes.position !== undefined) text += `Position: ${tl.attributes.position}\n`;
    if (tl.relationships?.board?.data?.id) text += `Board ID: ${tl.relationships.board.data.id}\n`;
    if (tl.attributes.created_at) text += `Created: ${tl.attributes.created_at}\n`;
    if (tl.attributes.updated_at) text += `Updated: ${tl.attributes.updated_at}`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleTaskListError(error);
  }
}

export async function updateTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskListSchema.parse(args);
    const response = await client.updateTaskList(params.task_list_id, { name: params.name });
    return {
      content: [{
        type: 'text',
        text: `Task list ${response.data.id} renamed to "${response.data.attributes.name}".`,
      }],
    };
  } catch (error) {
    handleTaskListError(error);
  }
}

export async function archiveTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = taskListIdOnlySchema.parse(args);
    const response = await client.archiveTaskList(params.task_list_id);
    return {
      content: [{ type: 'text', text: `Task list ${response.data.id} archived. Use restore_task_list to bring it back.` }],
    };
  } catch (error) {
    handleTaskListError(error);
  }
}

export async function restoreTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = taskListIdOnlySchema.parse(args);
    const response = await client.restoreTaskList(params.task_list_id);
    return {
      content: [{ type: 'text', text: `Task list ${response.data.id} restored.` }],
    };
  } catch (error) {
    handleTaskListError(error);
  }
}

export async function repositionTaskList(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = repositionTaskListSchema.parse(args);
    const attrs: { move_before_id?: string } = {};
    if (params.move_before_id !== undefined) attrs.move_before_id = params.move_before_id;
    const response = await client.repositionTaskList(params.task_list_id, attrs);
    let text = `Task list ${response.data.id} repositioned.`;
    if (params.move_before_id) text += ` Moved before task list ${params.move_before_id}.`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleTaskListError(error);
  }
}

export const getTaskListTool = {
  name: 'get_task_list',
  description: 'Get details of a specific task list by its ID.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: { type: 'string', description: 'The ID of the task list' },
    },
    required: ['task_list_id'],
  },
};

export const updateTaskListTool = {
  name: 'update_task_list',
  description: 'Rename an existing task list.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: { type: 'string', description: 'The ID of the task list to rename' },
      name: { type: 'string', description: 'New name for the task list' },
    },
    required: ['task_list_id', 'name'],
  },
};

export const archiveTaskListTool = {
  name: 'archive_task_list',
  description: 'Archive a task list. This is reversible — use restore_task_list to undo.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: { type: 'string', description: 'The ID of the task list to archive' },
    },
    required: ['task_list_id'],
  },
};

export const restoreTaskListTool = {
  name: 'restore_task_list',
  description: 'Restore a previously archived task list.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: { type: 'string', description: 'The ID of the task list to restore' },
    },
    required: ['task_list_id'],
  },
};

export const repositionTaskListTool = {
  name: 'reposition_task_list',
  description: 'Reposition a task list within its board. Optionally move it before another task list.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_list_id: { type: 'string', description: 'The ID of the task list to move' },
      move_before_id: { type: 'string', description: 'Optional — ID of the task list to move this one before' },
    },
    required: ['task_list_id'],
  },
};
