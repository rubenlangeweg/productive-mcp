import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listProjectsSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  company_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export const listProjectsOutputSchema = z.object({
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    status: z.string().optional(),
    description: z.string().optional(),
    companyId: z.string().optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export async function listProjectsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listProjectsOutputSchema> }> {
  try {
    const params = listProjectsSchema.parse(args || {});
    const response = await client.listProjects({ status: params.status, company_id: params.company_id, limit: params.limit });

    if (!response?.data?.length) {
      return {
        content: [{ type: 'text', text: 'No projects found matching the criteria.' }],
        structuredContent: { projects: [], returned: 0 },
      };
    }

    const projects = response.data.filter(p => p?.attributes).map(p => ({
      id: p.id,
      name: p.attributes.name,
      ...(p.attributes.status != null ? { status: String(p.attributes.status) } : {}),
      ...(p.attributes.description ? { description: p.attributes.description } : {}),
      ...(p.relationships?.company?.data?.id ? { companyId: p.relationships.company.data.id } : {}),
    }));

    const text = projects.map(p =>
      `• ${p.name} (ID: ${p.id})\n  Status: ${p.status ?? 'unknown'}${p.companyId ? `\n  Company ID: ${p.companyId}` : ''}${p.description ? `\n  ${p.description}` : ''}`
    ).join('\n\n');

    const n = projects.length;
    const total = response.meta?.total_count;
    const summary = `Found ${n} project${n !== 1 ? 's' : ''}${total ? ` (showing ${n} of ${total})` : ''}:\n\n${text}`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: { projects, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listProjectsDefinition = {
  name: 'list_projects',
  description: 'List projects in your Productive organisation. Filter by status or company.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List projects' },
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by project status' },
      company_id: { type: 'string', description: 'Filter projects by company ID' },
      limit: { type: 'number', description: 'Number of projects to return (1-200)', minimum: 1, maximum: 200, default: 30 },
    },
  },
  outputSchema: listProjectsOutputSchema.shape,
};
