import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listCompaniesSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export const listCompaniesOutputSchema = z.object({
  companies: z.array(z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export async function listCompaniesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listCompaniesOutputSchema> }> {
  try {
    const params = listCompaniesSchema.parse(args || {});
    const response = await client.listCompanies({ status: params.status, limit: params.limit });

    if (!response?.data?.length) {
      return {
        content: [{ type: 'text', text: 'No companies found matching the criteria.' }],
        structuredContent: { companies: [], returned: 0 },
      };
    }

    const companies = response.data.filter(c => c?.attributes).map(c => ({
      id: c.id,
      name: c.attributes.name,
      ...(c.attributes.domain ? { domain: c.attributes.domain } : {}),
      ...(c.attributes.description ? { description: c.attributes.description } : {}),
      tags: c.attributes.tag_list ?? [],
    }));

    const text = companies.map(c => {
      const tagLine = c.tags.length ? `\n  Tags: ${c.tags.join(', ')}` : '';
      return `• ${c.name} (ID: ${c.id})\n  ${c.domain ? `Domain: ${c.domain}` : 'No domain'}${c.description ? `\n  ${c.description}` : ''}${tagLine}`;
    }).join('\n\n');

    const n = companies.length;
    const total = response.meta?.total_count;
    const summary = `Found ${n} compan${n !== 1 ? 'ies' : 'y'}${total ? ` (showing ${n} of ${total})` : ''}:\n\n${text}`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: { companies, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listCompaniesDefinition = {
  name: 'list_companies',
  description: 'List companies (clients) in your Productive organisation. Filter by active or archived status.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List companies' },
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by company status' },
      limit: { type: 'number', description: 'Number of companies to return (1-200)', minimum: 1, maximum: 200, default: 30 },
    },
  },
  outputSchema: listCompaniesOutputSchema.shape,
};
