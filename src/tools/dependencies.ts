import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listDepsSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
});

const addDepSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  depends_on_task_id: z.string().min(1, 'Depends-on task ID is required'),
  type: z.enum(['blocking', 'waiting_on', 'related']).default('blocking'),
});

const removeDepSchema = z.object({
  dependency_id: z.string().min(1, 'Dependency ID is required'),
});

export async function listTaskDependenciesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listDepsSchema.parse(args);
    const response = await client.listTaskDependencies(params.task_id);

    if (!response.data || response.data.length === 0) {
      return {
        content: [{ type: 'text', text: `No dependencies found for task ${params.task_id}.` }],
      };
    }

    const items = response.data.map(dep => {
      const taskId = dep.relationships?.task?.data?.id ?? 'unknown';
      const dependsOnId = dep.relationships?.depends_on?.data?.id ?? 'unknown';
      const typeStr = dep.attributes.type_string ?? 'related';
      return `• Dependency ID: ${dep.id}\n  Type: ${typeStr}\n  Task ID: ${taskId} → depends on → Task ID: ${dependsOnId}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Dependencies for task ${params.task_id} (${response.data.length} found):\n\n${items}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function addTaskDependencyTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = addDepSchema.parse(args);

    const response = await client.addTaskDependency({
      data: {
        type: 'task_dependencies',
        attributes: { type_string: params.type },
        relationships: {
          task: { data: { id: params.task_id, type: 'tasks' } },
          depends_on: { data: { id: params.depends_on_task_id, type: 'tasks' } },
        },
      },
    });

    const typeStr = response.data.attributes.type_string ?? params.type;
    return {
      content: [{
        type: 'text',
        text: `Dependency created (ID: ${response.data.id})\nType: ${typeStr}\nTask ${params.task_id} → ${typeStr} → Task ${params.depends_on_task_id}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function removeTaskDependencyTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = removeDepSchema.parse(args);
    await client.removeTaskDependency(params.dependency_id);
    return {
      content: [{ type: 'text', text: `Dependency ${params.dependency_id} removed successfully.` }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listTaskDependenciesDefinition = {
  name: 'list_task_dependencies',
  description: 'List all dependencies for a task in Productive.io (blocking, waiting_on, related).',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task' },
    },
    required: ['task_id'],
  },
};

export const addTaskDependencyDefinition = {
  name: 'add_task_dependency',
  description: 'Add a dependency relationship between two tasks in Productive.io.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task that has the dependency' },
      depends_on_task_id: { type: 'string', description: 'The ID of the task being depended upon' },
      type: {
        type: 'string',
        enum: ['blocking', 'waiting_on', 'related'],
        description: 'Dependency type: blocking (task_id blocks depends_on), waiting_on (task_id waits on depends_on), related (general relation). Default: blocking.',
        default: 'blocking',
      },
    },
    required: ['task_id', 'depends_on_task_id'],
  },
};

export const removeTaskDependencyDefinition = {
  name: 'remove_task_dependency',
  description: 'Remove a task dependency by its dependency ID. Use list_task_dependencies first to find the dependency ID.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      dependency_id: { type: 'string', description: 'The ID of the dependency to remove (not a task ID)' },
    },
    required: ['dependency_id'],
  },
};
