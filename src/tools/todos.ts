import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listTodosSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
});

const getTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
});

const createTodoSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  description: z.string().min(1, 'Todo description is required'),
});

const updateTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
  description: z.string().min(1).optional(),
  closed: z.boolean().optional(),
});

const deleteTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
});

export async function listTodosTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listTodosSchema.parse(args);
    const response = await client.listTodos(params.task_id);

    if (!response.data || response.data.length === 0) {
      return {
        content: [{ type: 'text', text: `No todos found for task ${params.task_id}.` }],
      };
    }

    const items = response.data.map(todo =>
      `${todo.attributes.closed ? '☑' : '☐'} ${todo.attributes.description} (ID: ${todo.id})`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Todos for task ${params.task_id} (${response.data.length} found):\n\n${items}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function createTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createTodoSchema.parse(args);

    const response = await client.createTodo({
      data: {
        type: 'todos',
        attributes: { description: params.description },
        relationships: {
          task: { data: { id: params.task_id, type: 'tasks' } },
        },
      },
    });

    return {
      content: [{
        type: 'text',
        text: `Todo created successfully!\nDescription: ${response.data.attributes.description} (ID: ${response.data.id})\nTask ID: ${params.task_id}\nClosed: ${response.data.attributes.closed}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function updateTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTodoSchema.parse(args);

    if (params.description === undefined && params.closed === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one of description or closed must be provided');
    }

    const attrs: { description?: string; closed?: boolean } = {};
    if (params.description !== undefined) attrs.description = params.description;
    if (params.closed !== undefined) attrs.closed = params.closed;

    const response = await client.updateTodo(params.todo_id, attrs);

    return {
      content: [{
        type: 'text',
        text: `Todo updated successfully!\nDescription: ${response.data.attributes.description} (ID: ${response.data.id})\nClosed: ${response.data.attributes.closed}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function deleteTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteTodoSchema.parse(args);
    await client.deleteTodo(params.todo_id);
    return {
      content: [{ type: 'text', text: `Todo ${params.todo_id} deleted successfully.` }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listTodosDefinition = {
  name: 'list_todos',
  description: 'List all todo/checklist items for a specific task in Productive.io.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task' },
    },
    required: ['task_id'],
  },
};

export const createTodoDefinition = {
  name: 'create_todo',
  description: 'Create a new todo/checklist item on a task in Productive.io.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task to add the todo to' },
      description: { type: 'string', description: 'The todo item text' },
    },
    required: ['task_id', 'description'],
  },
};

export const updateTodoDefinition = {
  name: 'update_todo',
  description: 'Update a todo/checklist item — rename it or mark it as completed/incomplete.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: { type: 'string', description: 'The ID of the todo item' },
      description: { type: 'string', description: 'New description text for the todo item' },
      closed: { type: 'boolean', description: 'Set to true to mark as done, false to mark as incomplete' },
    },
    required: ['todo_id'],
  },
};

export const deleteTodoDefinition = {
  name: 'delete_todo',
  description: 'Delete a todo/checklist item from a task in Productive.io.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: { type: 'string', description: 'The ID of the todo item to delete' },
    },
    required: ['todo_id'],
  },
};

export async function getTodoTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getTodoSchema.parse(args);
    const response = await client.getTodo(params.todo_id);
    const todo = response.data;
    const taskId = todo.relationships?.task?.data?.id;
    let text = `${todo.attributes.closed ? '☑' : '☐'} ${todo.attributes.description} (ID: ${todo.id})\n`;
    text += `Closed: ${todo.attributes.closed}\n`;
    if (taskId) text += `Task ID: ${taskId}\n`;
    if (todo.attributes.position !== undefined) text += `Position: ${todo.attributes.position}\n`;
    if (todo.attributes.created_at) text += `Created: ${todo.attributes.created_at}\n`;
    if (todo.attributes.updated_at) text += `Updated: ${todo.attributes.updated_at}`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const getTodoDefinition = {
  name: 'get_todo',
  description: 'Get a single todo/checklist item by its ID.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      todo_id: { type: 'string', description: 'The ID of the todo item' },
    },
    required: ['todo_id'],
  },
};
