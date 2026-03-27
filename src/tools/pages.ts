import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listPagesSchema = z.object({
  project_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getPageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
});

export async function listPagesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listPagesSchema.parse(args ?? {});
    const response = await client.listPages({ project_id: params.project_id, limit: params.limit });

    if (!response.data || response.data.length === 0) {
      const context = params.project_id ? `project ${params.project_id}` : 'your organisation';
      return {
        content: [{ type: 'text', text: `No pages found in ${context}.` }],
      };
    }

    const items = response.data.map(page => {
      const projectId = page.relationships?.project?.data?.id;
      const parentId = page.relationships?.parent?.data?.id;
      return `• ${page.attributes.title} (ID: ${page.id})
  ${projectId ? `Project ID: ${projectId}` : ''}
  ${parentId ? `Parent Page ID: ${parentId}` : 'Top-level page'}
  Updated: ${page.attributes.updated_at}`;
    }).join('\n\n');

    const header = params.project_id
      ? `Pages in project ${params.project_id}`
      : 'Pages';

    return {
      content: [{
        type: 'text',
        text: `${header} (${response.data.length} found${response.meta?.total_count ? ` of ${response.meta.total_count}` : ''}):\n\n${items}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export async function getPageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getPageSchema.parse(args);
    const response = await client.getPage(params.page_id);

    const page = response.data;
    const projectId = page.relationships?.project?.data?.id;
    const parentId = page.relationships?.parent?.data?.id;

    let text = `Page: ${page.attributes.title} (ID: ${page.id})\n`;
    if (projectId) text += `Project ID: ${projectId}\n`;
    if (parentId) text += `Parent Page ID: ${parentId}\n`;
    if (page.attributes.visibility) text += `Visibility: ${page.attributes.visibility}\n`;
    text += `Created: ${page.attributes.created_at}\n`;
    text += `Updated: ${page.attributes.updated_at}\n`;
    if (page.attributes.content) {
      text += `\nContent:\n${page.attributes.content}`;
    }

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listPagesDefinition = {
  name: 'list_pages',
  description: 'List knowledge base pages in Productive.io. Filter by project to see project-specific docs.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter pages by project ID (optional — omit for all pages)' },
      limit: {
        type: 'number',
        description: 'Number of pages to return (1-200, default 30)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};

export const getPageDefinition = {
  name: 'get_page',
  description: 'Get the full content of a specific knowledge base page in Productive.io.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the page to retrieve' },
    },
    required: ['page_id'],
  },
};
