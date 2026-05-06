import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient } from '../api/client.js';

const ListActivitiesRequestSchema = z.object({
  task_id: z.string().optional(),
  project_id: z.string().optional(),
  person_id: z.string().optional(),
  item_type: z.string().optional(),
  event: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  days_back: z.number().min(1).max(365).optional(),
  limit: z.number().min(1).max(200).optional(),
  page: z.number().min(1).optional(),
});

export const listActivitiesOutputSchema = z.object({
  activities: z.array(z.object({
    id: z.string(),
    event: z.string().optional(),
    itemType: z.string().optional(),
    itemId: z.string().optional(),
    createdAt: z.string().optional(),
    creatorId: z.string().optional(),
    changes: z.record(z.unknown()).optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export async function listActivities(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listActivitiesOutputSchema> }> {
  try {
    const params = ListActivitiesRequestSchema.parse(args);

    let after = params.after;
    if (params.days_back && !after) {
      const date = new Date();
      date.setDate(date.getDate() - params.days_back);
      after = date.toISOString();
    }

    const response = await client.listActivities({
      task_id: params.task_id, project_id: params.project_id, person_id: params.person_id,
      item_type: params.item_type, event: params.event, after, before: params.before,
      limit: params.limit, page: params.page,
    });

    const activities = response.data.map(a => ({
      id: a.id,
      ...(a.attributes.event ? { event: a.attributes.event } : {}),
      ...(a.attributes.item_type ? { itemType: a.attributes.item_type } : {}),
      ...(a.attributes.item_id != null ? { itemId: String(a.attributes.item_id) } : {}),
      ...(a.attributes.created_at ? { createdAt: a.attributes.created_at } : {}),
      ...(a.relationships?.creator?.data?.id ? { creatorId: a.relationships.creator.data.id } : {}),
      ...(a.attributes.changes && Object.keys(a.attributes.changes).length > 0 ? { changes: a.attributes.changes as Record<string, unknown> } : {}),
    }));

    const total = response.meta?.total_count;
    const n = activities.length;
    let output = `Found ${n} activit${n !== 1 ? 'ies' : 'y'}${total ? ` (${total} total)` : ''}`;
    if (params.days_back) output += ` from the last ${params.days_back} days`;
    else if (after ?? params.before) output += ` within specified date range`;
    output += ':\n\n';

    if (n === 0) {
      output += 'No activities found for the specified criteria.';
    } else {
      for (const a of activities) {
        const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : 'unknown';
        output += `• ${when} - ${a.event ?? '?'} ${a.itemType ?? '?'} (ID: ${a.itemId ?? a.id})`;
        if (a.changes && Object.keys(a.changes).length > 0) {
          const changes = Object.entries(a.changes).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
          output += `\n  Changes: ${changes}`;
        }
        if (a.creatorId) output += `\n  Creator: Person ID ${a.creatorId}`;
        output += '\n\n';
      }
    }

    if (response.links?.next) output += 'Use page parameter to get more results.';

    return {
      content: [{ type: 'text', text: output }],
      structuredContent: { activities, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, `Failed to list activities: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const listActivitiesTool = {
  name: 'list_activities',
  description: 'List activities (changes/updates) from Productive.io with filtering options for tracking recent work',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List activities' },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Filter activities for a specific task ID' },
      project_id: { type: 'string', description: 'Filter activities for a specific project ID' },
      person_id: { type: 'string', description: 'Filter activities by a specific person/user ID' },
      item_type: { type: 'string', description: 'Filter by item type (e.g., "Task", "Project")' },
      event: { type: 'string', description: 'Filter by event type (e.g., "create", "update", "delete")' },
      after: { type: 'string', description: 'Filter activities after this date (ISO 8601)' },
      before: { type: 'string', description: 'Filter activities before this date (ISO 8601)' },
      days_back: { type: 'number', description: 'Filter activities from the last N days (1-365)', minimum: 1, maximum: 365 },
      limit: { type: 'number', description: 'Maximum number of activities to return (1-200)', minimum: 1, maximum: 200 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
    additionalProperties: false,
  },
  outputSchema: listActivitiesOutputSchema.shape,
};
