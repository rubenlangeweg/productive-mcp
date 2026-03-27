import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listTodosSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
});

const createTodoSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  title: z.string().min(1, 'Todo title is required'),
});

const updateTodoSchema = z.object({
  todo_id: z.string().min(1, 'Todo ID is required'),
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
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
      `${todo.attributes.completed ? '☑' : '☐'} ${todo.attributes.title} (ID: ${todo.id})`
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
        attributes: { title: params.title },
        relationships: {
          task: { data: { id: params.task_id, type: 'tasks' } },
        },
      },
    });

    return {
      content: [{
        type: 'text',
        text: `Todo created successfully!\nTitle: ${response.data.attributes.title} (ID: ${response.data.id})\nTask ID: ${params.task_id}\nCompleted: ${response.data.attributes.completed}`,
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

    if (params.title === undefined && params.completed === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one of title or completed must be provided');
    }

    const attrs: { title?: string; completed?: boolean } = {};
    if (params.title !== undefined) attrs.title = params.title;
    if (params.completed !== undefined) attrs.completed = params.completed;

    const response = await client.updateTodo(params.todo_id, attrs);

    return {
      content: [{
        type: 'text',
        text: `Todo updated successfully!\nTitle: ${response.data.attributes.title} (ID: ${response.data.id})\nCompleted: ${response.data.attributes.completed}`,
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
      title: { type: 'string', description: 'The todo item text' },
    },
    required: ['task_id', 'title'],
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
      title: { type: 'string', description: 'New title for the todo item' },
      completed: { type: 'boolean', description: 'Set to true to mark as done, false to mark as incomplete' },
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
