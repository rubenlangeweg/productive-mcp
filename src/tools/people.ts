import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listPeopleSchema = z.object({
  company_id: z.string().optional(),
  project_id: z.string().optional(),
  is_active: z.boolean().optional(),
  email: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const getPersonSchema = z.object({
  person_id: z.string().min(1, 'Person ID is required'),
});

export const listPeopleOutputSchema = z.object({
  people: z.array(z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().optional(),
    title: z.string().optional(),
    role: z.string().optional(),
    status: z.enum(['active', 'inactive']),
    companyId: z.string().optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export const getPersonOutputSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  title: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  companyId: z.string().optional(),
  createdAt: z.string().optional(),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export async function listPeopleTool(client: ProductiveAPIClient, args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: z.infer<typeof listPeopleOutputSchema>;
}> {
  try {
    const params = listPeopleSchema.parse(args || {});
    const response = await client.listPeople({
      company_id: params.company_id,
      project_id: params.project_id,
      is_active: params.is_active,
      email: params.email,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data?.length) {
      return {
        content: [{ type: 'text', text: 'No people found matching the criteria.' }],
        structuredContent: { people: [], returned: 0 },
      };
    }

    const people = response.data.map(person => ({
      id: person.id,
      firstName: person.attributes.first_name,
      lastName: person.attributes.last_name,
      ...(person.attributes.email ? { email: person.attributes.email } : {}),
      ...(person.attributes.title ? { title: person.attributes.title } : {}),
      ...(person.attributes.role ? { role: person.attributes.role } : {}),
      status: person.attributes.is_active === false ? ('inactive' as const) : ('active' as const),
      ...(person.relationships?.company?.data?.id ? { companyId: person.relationships.company.data.id } : {}),
    }));

    const total = response.meta?.total_count;
    const peopleText = people.map(p => {
      const name = `${p.firstName} ${p.lastName}`.trim();
      return `• ${name} (ID: ${p.id})\n  Email: ${p.email ?? 'N/A'}\n  Status: ${p.status}${p.title ? `\n  Title: ${p.title}` : ''}${p.role ? `\n  Role: ${p.role}` : ''}${p.companyId ? `\n  Company ID: ${p.companyId}` : ''}`;
    }).join('\n\n');

    const n = people.length;
    const summary = `Found ${n} person/people${total ? ` (showing ${n} of ${total})` : ''}:\n\n${peopleText}`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: { people, returned: n, ...(total != null ? { total } : {}) },
    };
  } catch (error) {
    handleError(error);
  }
}

export async function getPersonTool(client: ProductiveAPIClient, args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: z.infer<typeof getPersonOutputSchema>;
}> {
  try {
    const params = getPersonSchema.parse(args);
    const response = await client.getPerson(params.person_id);
    const person = response.data;
    const companyId = person.relationships?.company?.data?.id;
    const status = person.attributes.is_active === false ? ('inactive' as const) : ('active' as const);

    const sc: z.infer<typeof getPersonOutputSchema> = {
      id: person.id,
      firstName: person.attributes.first_name,
      lastName: person.attributes.last_name,
      ...(person.attributes.email ? { email: person.attributes.email } : {}),
      ...(person.attributes.title ? { title: person.attributes.title } : {}),
      ...(person.attributes.role ? { role: person.attributes.role } : {}),
      status,
      ...(companyId ? { companyId } : {}),
      ...(person.attributes.created_at ? { createdAt: person.attributes.created_at } : {}),
    };

    const name = `${sc.firstName} ${sc.lastName}`.trim();
    let text = `Person Details:\n\nName: ${name}\nID: ${person.id}\nEmail: ${sc.email ?? 'N/A'}\nStatus: ${status}`;
    if (sc.title) text += `\nTitle: ${sc.title}`;
    if (sc.role) text += `\nRole: ${sc.role}`;
    if (sc.companyId) text += `\nCompany ID: ${sc.companyId}`;
    if (sc.createdAt) text += `\nCreated: ${sc.createdAt}`;

    return { content: [{ type: 'text', text }], structuredContent: sc };
  } catch (error) {
    handleError(error);
  }
}

export const listPeopleDefinition = {
  name: 'list_people',
  description: 'List people (team members) in your Productive.io organization. Use to find person IDs for task assignment, time entries, and filtering. Supports filtering by company, project membership, active status, and email.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List people' },
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Filter by company ID' },
      project_id: { type: 'string', description: 'Filter by project membership (people assigned to this project)' },
      is_active: { type: 'boolean', description: 'Filter by active status (true = active, false = inactive/archived)' },
      email: { type: 'string', description: 'Filter by email address' },
      limit: { type: 'number', description: 'Number of results to return (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
  outputSchema: listPeopleOutputSchema.shape,
};

export const getPersonDefinition = {
  name: 'get_person',
  description: 'Get detailed information about a specific person by their Productive ID.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'Get person' },
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'string', description: 'The ID of the person to retrieve (required)' },
    },
    required: ['person_id'],
  },
  outputSchema: getPersonOutputSchema.shape,
};
