import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTaskUpdate } from '../api/types.js';

const updateTaskStatusSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  workflow_status_id: z.string().min(1).optional(),
  status_name: z.string().min(1).optional(),
}).refine(
  data => data.workflow_status_id !== undefined || data.status_name !== undefined,
  { message: 'Either workflow_status_id or status_name must be provided' }
);

/**
 * Resolve a status name to a workflow status ID for the task's workflow.
 *
 * Strategy:
 * 1. Get the task to find its project ID.
 * 2. Try matching against the project's workflow statuses (no workflow filter
 *    if we cannot determine one — Productive lists statuses across the org and
 *    we filter client-side).
 * 3. Match case-insensitively. Prefer exact > startsWith > includes.
 * 4. If no match, throw an InvalidParams error listing the available names.
 */
async function resolveStatusIdByName(
  client: ProductiveAPIClient,
  taskId: string,
  statusName: string
): Promise<string> {
  // Step 1: get the task (mainly to confirm it exists and to read project ID
  // for diagnostic context).
  const task = await client.getTask(taskId);
  const projectId = task.data.relationships?.project?.data?.id;

  // Step 2: list workflow statuses. The Productive API exposes statuses tied
  // to workflows; tasks reference workflow statuses directly. We list all
  // statuses (capped at 200) and filter by name client-side. A workflow ID
  // filter would require an extra fetch to resolve task → workflow.
  const statuses = await client.listWorkflowStatuses({ limit: 200 });
  if (!statuses.data?.length) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `No workflow statuses available to resolve "${statusName}".`
    );
  }

  const needle = statusName.trim().toLowerCase();
  const candidates = statuses.data.map(s => ({
    id: s.id,
    name: s.attributes.name,
    nameLower: s.attributes.name.toLowerCase(),
  }));

  const exact = candidates.find(c => c.nameLower === needle);
  if (exact) return exact.id;

  const starts = candidates.find(c => c.nameLower.startsWith(needle));
  if (starts) return starts.id;

  const includes = candidates.find(c => c.nameLower.includes(needle));
  if (includes) return includes.id;

  const available = candidates.map(c => `"${c.name}" (ID: ${c.id})`).join(', ');
  const projectHint = projectId ? ` (task's project: ${projectId})` : '';
  throw new McpError(
    ErrorCode.InvalidParams,
    `No workflow status matches "${statusName}"${projectHint}. Available: ${available}`
  );
}

export async function updateTaskStatusTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTaskStatusSchema.parse(args);

    let workflowStatusId = params.workflow_status_id;
    if (!workflowStatusId && params.status_name) {
      workflowStatusId = await resolveStatusIdByName(
        client,
        params.task_id,
        params.status_name
      );
    }

    if (!workflowStatusId) {
      // Refine guarantees one of the two is provided, but the type system
      // requires us to assert. This branch is unreachable at runtime.
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either workflow_status_id or status_name must be provided'
      );
    }

    const taskUpdate: ProductiveTaskUpdate = {
      data: {
        type: 'tasks',
        id: params.task_id,
        relationships: {
          workflow_status: {
            data: {
              id: workflowStatusId,
              type: 'workflow_statuses',
            },
          },
        },
      },
    };

    const response = await client.updateTask(params.task_id, taskUpdate);

    let text = `Task status updated successfully!\n`;
    text += `Task: ${response.data.attributes.title} (ID: ${response.data.id})\n`;
    text += `Workflow Status ID: ${workflowStatusId}`;
    if (params.status_name) {
      text += ` (resolved from name "${params.status_name}")`;
    }

    if (response.data.attributes.closed !== undefined) {
      const statusText = response.data.attributes.closed ? 'closed' : 'open';
      text += `\nActual Status: ${statusText}`;
    }

    if (response.data.attributes.updated_at) {
      text += `\nUpdated at: ${response.data.attributes.updated_at}`;
    }

    return {
      content: [{
        type: 'text',
        text: text,
      }],
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
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

export const updateTaskStatusDefinition = {
  name: 'update_task_status',
  description: 'Update the status of a task. Provide either workflow_status_id directly, or status_name (case-insensitive, partial match) to resolve it from list_workflow_statuses.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'ID of the task to update (required)',
      },
      workflow_status_id: {
        type: 'string',
        description: 'ID of the workflow status to set. If omitted, status_name is used to resolve it.',
      },
      status_name: {
        type: 'string',
        description: 'Status name (e.g. "In Progress", "Done"). Case-insensitive, partial match. Used when workflow_status_id is not given.',
      },
    },
    required: ['task_id'],
  },
};
