import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export * from './tasks-write.js';

const listTasksSchema = z.object({
  project_id: z.string().optional(),
  assignee_id: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getProjectTasksSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  status: z.enum(['open', 'closed']).optional(),
});

const getTaskSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
});

export async function listTasksTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listTasksSchema.parse(args || {});

    const response = await client.listTasks({
      project_id: params.project_id,
      assignee_id: params.assignee_id,
      status: params.status,
      limit: params.limit,
    });

    if (!response || !response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No tasks found matching the criteria.',
        }],
      };
    }

    const tasksText = response.data.filter(task => task && task.attributes).map(task => {
      const projectId = task.relationships?.project?.data?.id;
      const assigneeId = task.relationships?.assignee?.data?.id;
      // Productive responses expose `closed: boolean` rather than `status: number`.
      const statusText = task.attributes.closed === true ? 'closed' : task.attributes.closed === false ? 'open' : 'unknown';
      return `• ${task.attributes.title} (ID: ${task.id})
  Status: ${statusText}
  ${task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date'}
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${assigneeId ? `Assignee ID: ${assigneeId}` : 'Unassigned'}
  ${task.attributes.description ? `Description: ${task.attributes.description}` : ''}`;
    }).join('\n\n');

    const summary = `Found ${response.data.length} task${response.data.length !== 1 ? 's' : ''}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${tasksText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
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

export async function getProjectTasksTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getProjectTasksSchema.parse(args);

    const response = await client.listTasks({
      project_id: params.project_id,
      status: params.status,
      limit: 200, // Get maximum tasks for a project
    });

    if (!response || !response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No tasks found for project ${params.project_id}.`,
        }],
      };
    }

    const tasksText = response.data.filter(task => task && task.attributes).map(task => {
      const assigneeId = task.relationships?.assignee?.data?.id;
      // Productive responses expose `closed: boolean` rather than `status: number`.
      const statusText = task.attributes.closed === true ? 'closed' : task.attributes.closed === false ? 'open' : 'unknown';
      return `• ${task.attributes.title} (ID: ${task.id})
  Status: ${statusText}
  ${task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date'}
  ${assigneeId ? `Assignee ID: ${assigneeId}` : 'Unassigned'}
  ${task.attributes.description ? `Description: ${task.attributes.description}` : ''}`;
    }).join('\n\n');

    const summary = `Project ${params.project_id} has ${response.data.length} task${response.data.length !== 1 ? 's' : ''}:\n\n${tasksText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
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

export async function getTaskTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTaskSchema.parse(args);

    // Route through the shared API client so headers, error mapping, and
    // (eventually) retry are applied consistently. The previous implementation
    // re-imported config and called fetch() directly, bypassing the client.
    const data = await client.getTask(params.task_id, { include: 'task_list' });
    const task = data.data;
    const projectId = task.relationships?.project?.data?.id;
    const assigneeId = task.relationships?.assignee?.data?.id;
    const taskListId = task.relationships?.task_list?.data?.id;

    // Productive responses expose `closed: boolean` (the legacy `status:
    // number` is request-only).
    const statusText = task.attributes.closed === true ? 'closed' : task.attributes.closed === false ? 'open' : 'unknown';

    let text = `Task Details:\n\n`;
    text += `Title: ${task.attributes.title}\n`;
    text += `ID: ${task.id}\n`;
    text += `Status: ${statusText}\n`;

    if (task.attributes.description) {
      text += `Description: ${task.attributes.description}\n`;
    }

    if (task.attributes.due_date) {
      text += `Due Date: ${task.attributes.due_date}\n`;
    } else {
      text += `Due Date: No due date set\n`;
    }

    if (projectId) {
      text += `Project ID: ${projectId}\n`;
    }

    if (assigneeId) {
      text += `Assignee ID: ${assigneeId}\n`;
    } else {
      text += `Assignee: Unassigned\n`;
    }

    if (task.attributes.created_at) {
      text += `Created: ${task.attributes.created_at}\n`;
    }

    if (task.attributes.updated_at) {
      text += `Updated: ${task.attributes.updated_at}\n`;
    }

    // Include any additional attributes that might be useful
    if (task.attributes.priority !== undefined) {
      text += `Priority: ${task.attributes.priority}\n`;
    }

    if (task.attributes.placement !== undefined) {
      text += `Position: ${task.attributes.placement}\n`;
    }

    // Add useful additional fields from actual API response
    if (task.attributes.task_number) {
      text += `Task Number: ${task.attributes.task_number}\n`;
    }

    if (task.attributes.private !== undefined) {
      text += `Private: ${task.attributes.private ? 'Yes' : 'No'}\n`;
    }

    if (task.attributes.initial_estimate) {
      text += `Initial Estimate: ${task.attributes.initial_estimate}\n`;
    }

    if (task.attributes.worked_time) {
      text += `Worked Time: ${task.attributes.worked_time}\n`;
    }

    if (task.attributes.last_activity_at) {
      text += `Last Activity: ${task.attributes.last_activity_at}\n`;
    }

    // Include task list ID information if available
    if (taskListId) {
      text += `Task List ID: ${taskListId}\n`;
      const included = data.included;
      if (included && Array.isArray(included)) {
        const taskList = included.find(
          (item): item is { type: string; id: string; attributes: { name: string } } =>
            !!item &&
            (item as { type?: unknown }).type === 'task_lists' &&
            (item as { id?: unknown }).id === taskListId
        );
        if (taskList) {
          text += `Task List: ${taskList.attributes.name}\n`;
        }
      }
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

export const listTasksDefinition = {
  name: 'list_tasks',
  description: 'Get a list of tasks from Productive.io',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Filter tasks by project ID',
      },
      assignee_id: {
        type: 'string',
        description: 'Filter tasks by assignee ID',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Filter by task status (open or closed)',
      },
      limit: {
        type: 'number',
        description: 'Number of tasks to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};

export const getProjectTasksDefinition = {
  name: 'get_project_tasks',
  description: 'Get all tasks for a specific project. ALSO used as STEP 4 in timesheet workflow to find task_id for linking time entries to specific tasks. Workflow: list_projects → list_project_deals → list_deal_services → get_project_tasks → create_time_entry.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed'],
        description: 'Filter by task status (open or closed)',
      },
    },
    required: ['project_id'],
  },
};

export const getTaskDefinition = {
  name: 'get_task',
  description: 'Get detailed information about a specific task by ID',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'The ID of the task to retrieve',
      },
    },
    required: ['task_id'],
  },
};

const deleteTaskSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
});

export async function deleteTaskTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteTaskSchema.parse(args);
    await client.deleteTask(params.task_id);
    return {
      content: [{ type: 'text', text: `Task ${params.task_id} deleted.` }],
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

export const deleteTaskDefinition = {
  name: 'delete_task',
  description: 'Permanently delete a task in Productive.io. This action is destructive and irreversible.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task to delete' },
    },
    required: ['task_id'],
  },
};
