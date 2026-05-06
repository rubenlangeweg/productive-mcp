import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveAPIClient } from '../api/client.js';

const RecentUpdatesRequestSchema = z.object({
  project_id: z.string().optional(),
  days_back: z.number().min(1).max(30).default(7),
  limit: z.number().min(1).max(200).optional(),
});

export const getRecentUpdatesOutputSchema = z.object({
  updates: z.array(z.object({
    date: z.string(),
    type: z.string(),
    id: z.string(),
    creatorId: z.string().optional(),
    changes: z.record(z.unknown()).optional(),
  })),
  summary: z.record(z.object({ count: z.number(), uniqueItems: z.number() })),
  returned: z.number(),
  daysBack: z.number(),
  projectId: z.string().optional(),
});

export async function getRecentUpdates(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof getRecentUpdatesOutputSchema> }> {
  try {
    const params = RecentUpdatesRequestSchema.parse(args);
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - params.days_back);
    const after = afterDate.toISOString();

    const response = await client.listActivities({
      project_id: params.project_id, after, event: 'update', limit: params.limit ?? 100,
    });

    const typeSummary: Record<string, { count: number; items: Set<string> }> = {};
    const updates: Array<{ date: string; type: string; id: string; creatorId?: string; changes?: Record<string, unknown> }> = [];

    for (const activity of response.data) {
      const itemType = activity.attributes.item_type;
      const itemId = activity.attributes.item_id;
      if (itemType == null) continue;

      if (!typeSummary[itemType]) typeSummary[itemType] = { count: 0, items: new Set() };
      typeSummary[itemType]!.count++;
      typeSummary[itemType]!.items.add(itemId);

      updates.push({
        date: new Date(activity.attributes.created_at).toLocaleString(),
        type: itemType,
        id: String(itemId),
        ...(activity.relationships?.creator?.data?.id ? { creatorId: activity.relationships.creator.data.id } : {}),
        ...(activity.attributes.changes && Object.keys(activity.attributes.changes).length > 0
          ? { changes: activity.attributes.changes as Record<string, unknown> }
          : {}),
      });
    }

    let output = `## Recent Updates Summary (Last ${params.days_back} Days)\n\n`;
    if (params.project_id) output += `**Project ID:** ${params.project_id}\n\n`;

    const summaryOutput: Record<string, { count: number; uniqueItems: number }> = {};
    if (Object.keys(typeSummary).length === 0) {
      output += 'No updates found in the specified timeframe.';
    } else {
      output += '### Summary by Item Type:\n';
      for (const [type, data] of Object.entries(typeSummary)) {
        summaryOutput[type] = { count: data.count, uniqueItems: data.items.size };
        output += `• **${type}**: ${data.count} updates across ${data.items.size} items\n`;
      }
      output += '\n### Detailed Updates:\n\n';
      updates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      for (const u of updates) {
        output += `**${u.date}** - ${u.type} (ID: ${u.id})\n`;
        if (u.creatorId) output += `  👤 Updated by: Person ID ${u.creatorId}\n`;
        if (u.changes && Object.keys(u.changes).length > 0) {
          output += '  📝 Changes:\n';
          for (const [f, v] of Object.entries(u.changes)) output += `    • ${f}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}\n`;
        }
        output += '\n';
      }
    }

    return {
      content: [{ type: 'text', text: output }],
      structuredContent: {
        updates,
        summary: summaryOutput,
        returned: updates.length,
        daysBack: params.days_back,
        ...(params.project_id ? { projectId: params.project_id } : {}),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, `Failed to get recent updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const getRecentUpdatesTool = {
  name: 'get_recent_updates',
  description: 'Get a summary of recent updates and changes in the last N days, with detailed breakdown by item type',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'Get recent updates' },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Optional project ID to filter updates for a specific project' },
      days_back: { type: 'number', description: 'Number of days to look back (1-30, default: 7)', minimum: 1, maximum: 30, default: 7 },
      limit: { type: 'number', description: 'Maximum number of updates to analyze (1-200, default: 100)', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  outputSchema: getRecentUpdatesOutputSchema.shape,
};
