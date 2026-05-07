import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listServicesSchema = z.object({
  company_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getProjectServicesSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

export async function listServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listServicesSchema.parse(args);

    const response = await client.listServices({
      company_id: params.company_id,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No services found matching the criteria.',
        }],
      };
    }

    const servicesText = response.data.map(service => {
      const companyId = service.relationships?.company?.data?.id;
      return `• ${service.attributes.name} (ID: ${service.id})
  ${companyId ? `Company ID: ${companyId}` : ''}
  ${service.attributes.description ? `Description: ${service.attributes.description}` : 'No description'}`;
    }).join('\n\n');

    const summary = `Found ${response.data.length} service${response.data.length !== 1 ? 's' : ''}${response.meta?.total_count ? ` (showing ${response.data.length} of ${response.meta.total_count})` : ''}:\n\n${servicesText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
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

export async function getProjectServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getProjectServicesSchema.parse(args);

    // Get deals for the project, then services for each deal
    const dealsResponse = await client.listProjectDeals({ project_id: params.project_id, limit: 50 });

    if (!dealsResponse.data || dealsResponse.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No deals/budgets found for project ${params.project_id}. Use list_project_deals first to get deal IDs, then list_deal_services for each deal.`,
        }],
      };
    }

    // Fetch services for all deals in parallel
    const allServices: string[] = [];
    for (const deal of dealsResponse.data) {
      const servicesResponse = await client.listDealServices({ deal_id: deal.id, limit: params.limit });
      if (servicesResponse.data && servicesResponse.data.length > 0) {
        const dealType = deal.attributes.budget_type === 1 ? 'Deal' : 'Budget';
        allServices.push(`--- ${dealType}: ${deal.attributes.name} (Deal ID: ${deal.id}) ---`);
        allServices.push(...servicesResponse.data.map(service =>
          `• ${service.attributes.name} (Service ID: ${service.id})
  ${service.attributes.description ? `Description: ${service.attributes.description}` : ''}`
        ));
      }
    }

    if (allServices.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No services found for project ${params.project_id}.`,
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Services for project ${params.project_id}:\n\n${allServices.join('\n')}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

const getDealSchema = z.object({
  deal_id: z.string().min(1, 'Deal ID is required'),
});

export async function getDealTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getDealSchema.parse(args);
    const response = await client.getDeal(params.deal_id);
    const deal = response.data;
    const a = deal.attributes;

    const budgetType = a.budget_type === 1 ? 'Deal' : a.budget_type === 2 ? 'Budget' : 'Deal/Budget';
    const projectId = deal.relationships?.project?.data?.id;

    let text = `${budgetType}: ${a.name} (ID: ${deal.id})\n`;
    if (projectId) text += `Project ID: ${projectId}\n`;
    if (a.value != null) text += `Value: ${a.value}\n`;
    if (a.created_at) text += `Created: ${a.created_at}\n`;
    if (a.updated_at) text += `Updated: ${a.updated_at}\n`;

    return { content: [{ type: 'text', text: text.trim() }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const getDealDefinition = {
  name: 'get_deal',
  description: 'Get details of a specific deal or budget by its ID.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      deal_id: { type: 'string', description: 'The ID of the deal or budget' },
    },
    required: ['deal_id'],
  },
};

export const listServicesDefinition = {
  name: 'list_services',
  description: 'List all services in the organization. NOTE: For timesheet entries, use the proper workflow instead: list_projects → list_project_deals → list_deal_services → create_time_entry. This tool shows all services but does not indicate which project/budget they belong to.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      company_id: {
        type: 'string',
        description: 'Filter services by company ID',
      },
      limit: {
        type: 'number',
        description: 'Number of services to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: [],
  },
};

// Zod schema for list project deals/budgets
const listProjectDealsSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  budget_type: z.number().int().min(1).max(2).optional().describe('Budget type: 1 = deal, 2 = budget'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

// Tool function for list project deals/budgets
export async function listProjectDealsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listProjectDealsSchema.parse(args);

    const response = await client.listProjectDeals({
      project_id: params.project_id,
      budget_type: params.budget_type,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No deals/budgets found for this project.',
        }],
      };
    }

    const dealsText = response.data.map(deal => {
      const budgetType = deal.attributes.budget_type === 1 ? 'Deal' :
                        deal.attributes.budget_type === 2 ? 'Budget' : 'Unknown';
      const value = deal.attributes.value ? ` (Value: ${deal.attributes.value})` : '';

      return `• ${budgetType} (ID: ${deal.id})
  Name: ${deal.attributes.name}${value}`;
    }).join('\n\n');

    const typeFilter = params.budget_type === 1 ? ' deals' :
                      params.budget_type === 2 ? ' budgets' : ' deals/budgets';

    const summary = `Found ${response.data.length}${typeFilter} for project ${params.project_id}:\n\n${dealsText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
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

// Zod schema for list deal services
const listDealServicesSchema = z.object({
  deal_id: z.string().min(1, 'Deal/Budget ID is required'),
  limit: z.number().min(1).max(200).default(30).optional(),
});

// Tool function for list deal services
export async function listDealServicesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listDealServicesSchema.parse(args);

    const response = await client.listDealServices({
      deal_id: params.deal_id,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No services found for this deal/budget.',
        }],
      };
    }

    const servicesText = response.data.map(service => {
      return `• Service (ID: ${service.id})
  Name: ${service.attributes.name || 'Unnamed Service'}
  ${service.attributes.description ? `Description: ${service.attributes.description}` : 'No description'}`;
    }).join('\n\n');

    const summary = `Found ${response.data.length} service${response.data.length !== 1 ? 's' : ''} for deal/budget ${params.deal_id}:\n\n${servicesText}`;

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  } catch (error) {
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

export const listProjectDealsDefinition = {
  name: 'list_project_deals',
  description: 'STEP 2 of timesheet workflow: Get deals/budgets for a specific project. COMPLETE WORKFLOW: 1) list_projects → 2) list_project_deals → 3) list_deal_services → 4) list_project_tasks (recommended) → 5) create_time_entry. This follows: Project → Deal/Budget → Service → Task → Time Entry.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project (required)',
      },
      budget_type: {
        type: 'number',
        description: 'Filter by budget type: 1 = deal, 2 = budget',
        minimum: 1,
        maximum: 2,
      },
      limit: {
        type: 'number',
        description: 'Number of deals/budgets to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['project_id'],
  },
};

export const listDealServicesDefinition = {
  name: 'list_deal_services',
  description: 'STEP 3 of timesheet workflow: Get services for a specific deal/budget. COMPLETE WORKFLOW: 1) list_projects → 2) list_project_deals → 3) list_deal_services → 4) list_project_tasks (recommended) → 5) create_time_entry. After this, optionally use list_project_tasks to find specific tasks to link your time entry to.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      deal_id: {
        type: 'string',
        description: 'The ID of the deal/budget (required)',
      },
      limit: {
        type: 'number',
        description: 'Number of services to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['deal_id'],
  },
};

export const getProjectServicesDefinition = {
  name: 'get_project_services',
  description: 'Get all services for a project by traversing its deals/budgets. Returns services grouped by deal/budget. Prefer using list_project_deals + list_deal_services for more control.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The ID of the project (required)',
      },
      limit: {
        type: 'number',
        description: 'Number of services per deal to return (1-200)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
    required: ['project_id'],
  },
};
