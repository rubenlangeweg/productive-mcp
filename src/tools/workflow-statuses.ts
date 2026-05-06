import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listWorkflowStatusesSchema = z.object({
  workflow_id: z.string().optional(),
  category_id: z.number().int().min(1).max(3).optional(),
  limit: z.number().min(1).max(200).default(50).optional(),
});

export const listWorkflowStatusesOutputSchema = z.object({
  statuses: z.array(z.object({
    id: z.string(),
    name: z.string(),
    categoryId: z.number().optional(),
    categoryName: z.string().optional(),
    position: z.number().optional(),
    workflowId: z.string().optional(),
  })),
  returned: z.number(),
});

const CATEGORY_NAMES: Record<number, string> = { 1: 'Not Started', 2: 'Started', 3: 'Closed' };

export async function listWorkflowStatusesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listWorkflowStatusesOutputSchema> }> {
  try {
    const params = listWorkflowStatusesSchema.parse(args);
    const response = await client.listWorkflowStatuses({ workflow_id: params.workflow_id, category_id: params.category_id, limit: params.limit });

    if (!response.data?.length) {
      return {
        content: [{ type: 'text', text: 'No workflow statuses found.' }],
        structuredContent: { statuses: [], returned: 0 },
      };
    }

    const statuses = response.data.map(s => ({
      id: s.id,
      name: s.attributes.name,
      ...(s.attributes.category_id != null ? { categoryId: s.attributes.category_id } : {}),
      ...(s.attributes.category_id != null ? { categoryName: CATEGORY_NAMES[s.attributes.category_id] ?? `Category ${s.attributes.category_id}` } : {}),
      ...(s.attributes.position != null ? { position: s.attributes.position } : {}),
      ...(s.relationships?.workflow?.data?.id ? { workflowId: s.relationships.workflow.data.id } : {}),
    }));

    const text = statuses.map(s =>
      `• ${s.name} (ID: ${s.id})\n  Category: ${s.categoryName ?? 'N/A'} (${s.categoryId ?? 'N/A'})\n  Workflow ID: ${s.workflowId ?? 'N/A'}\n  Position: ${s.position ?? 'N/A'}`
    ).join('\n\n');

    const n = statuses.length;
    return {
      content: [{ type: 'text', text: `Found ${n} workflow status${n !== 1 ? 'es' : ''}:\n\n${text}` }],
      structuredContent: { statuses, returned: n },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listWorkflowStatusesDefinition = {
  name: 'list_workflow_statuses',
  description: 'List workflow statuses available in Productive.io. These are used to set task status (Not Started=1, Started=2, Closed=3).',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List workflow statuses' },
  inputSchema: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'Filter by workflow ID' },
      category_id: { type: 'number', description: 'Filter by category: 1=Not Started, 2=Started, 3=Closed', minimum: 1, maximum: 3 },
      limit: { type: 'number', description: 'Number of statuses to return (1-200)', minimum: 1, maximum: 200, default: 50 },
    },
  },
  outputSchema: listWorkflowStatusesOutputSchema.shape,
};