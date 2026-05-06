import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listMembershipsSchema = z.object({
  project_id: z.string().optional(),
  person_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(50).optional(),
  page: z.number().min(1).optional(),
});

export const listMembershipsOutputSchema = z.object({
  memberships: z.array(z.object({
    id: z.string(),
    personId: z.string().optional(),
    projectId: z.string().optional(),
    role: z.string().optional(),
    createdAt: z.string().optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export async function listMembershipsTool(client: ProductiveAPIClient, args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: z.infer<typeof listMembershipsOutputSchema>;
}> {
  try {
    const params = listMembershipsSchema.parse(args || {});
    const response = await client.listMemberships({
      project_id: params.project_id, person_id: params.person_id, limit: params.limit, page: params.page,
    });

    if (!response.data?.length) {
      const ctx = params.project_id ? `project ${params.project_id}` : params.person_id ? `person ${params.person_id}` : 'the given criteria';
      return {
        content: [{ type: 'text', text: `No memberships found for ${ctx}.` }],
        structuredContent: { memberships: [], returned: 0 },
      };
    }

    const memberships = response.data.map(m => ({
      id: m.id,
      ...(m.relationships?.person?.data?.id ? { personId: m.relationships.person.data.id } : {}),
      ...(m.relationships?.project?.data?.id ? { projectId: m.relationships.project.data.id } : {}),
      ...(m.attributes.role != null ? { role: String(m.attributes.role) } : {}),
      ...(m.attributes.created_at ? { createdAt: m.attributes.created_at } : {}),
    }));

    const total = response.meta?.total_count;
    const ctx = params.project_id ? ` for project ${params.project_id}` : params.person_id ? ` for person ${params.person_id}` : '';
    const text = memberships.map(m =>
      `• Membership (ID: ${m.id})${m.personId ? `\n  Person ID: ${m.personId}` : ''}${m.projectId ? `\n  Project ID: ${m.projectId}` : ''}${m.role ? `\n  Role: ${m.role}` : ''}${m.createdAt ? `\n  Created: ${m.createdAt}` : ''}`
    ).join('\n\n');

    const n = memberships.length;
    return {
      content: [{ type: 'text', text: `Found ${n} membership${n !== 1 ? 's' : ''}${ctx}${total ? ` (showing ${n} of ${total})` : ''}:\n\n${text}` }],
      structuredContent: { memberships, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) { handleError(error); }
}

export const listMembershipsDefinition = {
  name: 'list_memberships',
  description: 'List project memberships in Productive.io. Use to see which people are members of a project, or which projects a person belongs to.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List memberships' },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter by project ID — returns all members of this project' },
      person_id: { type: 'string', description: 'Filter by person ID — returns all projects this person is a member of' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 50)', minimum: 1, maximum: 200, default: 50 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
  outputSchema: listMembershipsOutputSchema.shape,
};
