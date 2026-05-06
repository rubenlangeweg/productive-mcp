import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTaskUpdate } from '../api/types.js';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  project_id: z.string().optional(),
  board_id: z.string().optional(),
  task_list_id: z.string().optional(),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum(['open', 'closed']).optional().default('open'),
});

export async function createTaskTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTaskSchema.parse(args || {});

    // Handle "me" reference for assignee
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

    const taskData = {
      data: {
        type: 'tasks' as const,
        attributes: {
          title: params.title,
          description: params.description,
          due_date: params.due_date,
          status: params.status === 'open' ? 1 : 2,
        },
        relationships: {} as any,
      },
    };

    // Add relationships if provided
    if (params.project_id) {
      taskData.data.relationships.project = {
        data: {
          id: params.project_id,
          type: 'projects' as const,
        },
      };
    }

    if (params.board_id) {
      taskData.data.relationships.board = {
        data: {
          id: params.board_id,
          type: 'boards' as const,
        },
      };
    }

    if (params.task_list_id) {
      taskData.data.relationships.task_list = {
        data: {
          id: params.task_list_id,
          type: 'task_lists' as const,
        },
      };
    }

    if (assigneeId) {
      taskData.data.relationships.assignee = {
        data: {
          id: assigneeId,
          type: 'people' as const,
        },
      };
    }

    const response = await client.createTask(taskData);

    let text = `Task created successfully!\n`;
    text += `Title: ${response.data.attributes.title} (ID: ${response.data.id})`;
    if (response.data.attributes.description) {
      text += `\nDescription: ${response.data.attributes.description}`;
    }
    // Productive responses expose `closed: boolean`. The intended new status sent
    // on POST is reflected back via that field.
    const statusText = response.data.attributes.closed === true ? 'closed' : response.data.attributes.closed === false ? 'open' : 'unknown';
    text += `\nStatus: ${statusText}`;
    if (response.data.attributes.due_date) {
      text += `\nDue date: ${response.data.attributes.due_date}`;
    }
    if (params.project_id) {
      text += `\nProject ID: ${params.project_id}`;
    }
    if (params.board_id) {
      text += `\nBoard ID: ${params.board_id}`;
    }
    if (params.task_list_id) {
      text += `\nTask List ID: ${params.task_list_id}`;
    }
    if (assigneeId) {
      text += `\nAssignee ID: ${assigneeId}`;
      if (params.assignee_id === 'me' && config?.PRODUCTIVE_USER_ID) {
        text += ` (me)`;
      }
    }
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
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const createTaskDefinition = {
  name: 'create_task',
  description: 'Create a new task in Productive.io. If PRODUCTIVE_USER_ID is configured, you can use "me" to refer to the configured user when assigning.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Task title (required)',
      },
      description: {
        type: 'string',
        description: 'Task description',
      },
      project_id: {
        type: 'string',
        description: 'ID of the project to add the task to',
      },
      board_id: {
        type: 'string',
        description: 'ID of the board to add the task to',
      },
      task_list_id: {
        type: 'string',
        description: 'ID of the task list to add the task to',
      },
      assignee_id: {
        type: 'string',
        description: 'ID of the person to assign the task to. If PRODUCTIVE_USER_ID is configured in environment, "me" refers to that user.',
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Task status (default: open)',
      },
    },
    required: ['title'],
  },
};

const updateTaskAssignmentSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  assignee_id: z.string().describe('ID of the person to assign (use "null" string to unassign)'),
});

export async function updateTaskAssignmentTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskAssignmentSchema.parse(args);

    // Handle "me" reference and "null" string
    let assigneeId: string | null = params.assignee_id;
    if (assigneeId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured in environment'
        );
      }
      assigneeId = config.PRODUCTIVE_USER_ID;
    } else if (assigneeId === 'null') {
      assigneeId = null;
    }

    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        relationships: assigneeId ? {
          assignee: {
            data: {
              id: assigneeId,
              type: 'people'
            }
          }
        } : {
          assignee: {
            data: null
          }
        }
      }
    };

    const response = await client.updateTask(params.task_id, taskUpdate);

    let text = `Task assignment updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;

    if (assigneeId) {
      text += `Assigned to: Person ID ${assigneeId}`;
      if (params.assignee_id === 'me' && config?.PRODUCTIVE_USER_ID) {
        text += ` (me)`;
      }
    } else {
      text += `Task is now unassigned`;
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
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const updateTaskAssignmentDefinition = {
  name: 'update_task_assignment',
  description: 'Update the assignee of an existing task. If PRODUCTIVE_USER_ID is configured, you can use "me" to refer to the configured user. To unassign, use "null" as a string.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      assignee_id: {
        type: 'string',
        description: 'ID of the person to assign the task to (use "null" string to unassign). If PRODUCTIVE_USER_ID is configured in environment, "me" refers to that user.',
      },
    },
    required: ['task_id', 'assignee_id'],
  },
};

const updateTaskDetailsSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  title: z.string().min(1, 'Task title cannot be empty').optional(),
  description: z.string().optional(),
});

export async function updateTaskDetailsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskDetailsSchema.parse(args);

    // Ensure at least one field is being updated
    if (!params.title && params.description === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'At least one field (title or description) must be provided for update'
      );
    }

    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        attributes: {}
      }
    };

    // Only include fields that are being updated
    if (params.title) {
      taskUpdate.data.attributes!.title = params.title;
    }

    if (params.description !== undefined) {
      taskUpdate.data.attributes!.description = params.description;
    }

    const response = await client.updateTask(params.task_id, taskUpdate);

    let text = `Task details updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;

    if (params.title) {
      text += `✓ Title updated to: "${response.data.attributes.title}"\n`;
    }

    if (params.description !== undefined) {
      if (response.data.attributes.description) {
        text += `✓ Description updated to: "${response.data.attributes.description}"\n`;
      } else {
        text += `✓ Description cleared\n`;
      }
    }

    if (response.data.attributes.updated_at) {
      text += `Updated at: ${response.data.attributes.updated_at}`;
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
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

export const updateTaskDetailsDefinition = {
  name: 'update_task_details',
  description: 'Update the title (name) and/or description of an existing task. At least one field must be provided.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      title: {
        type: 'string',
        description: 'New title/name for the task (optional, but cannot be empty if provided)',
      },
      description: {
        type: 'string',
        description: 'New description for the task (optional, use empty string to clear description)',
      },
    },
    required: ['task_id'],
  },
};
