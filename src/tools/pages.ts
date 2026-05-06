import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const listPagesSchema = z.object({
  project_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getPageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
});

const createPageSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  title: z.string().min(1, 'Title is required'),
  body: z.string().optional(),
  parent_page_id: z.string().optional(),
});

const updatePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});

const deletePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
});

const movePageSchema = z.object({
  page_id: z.string().min(1, 'Page ID is required'),
  target_doc_id: z.string().min(1, 'Target doc/page ID is required'),
});

const copyPageSchema = z.object({
  template_id: z.string().min(1, 'Template page ID is required'),
  project_id: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleError(error: unknown): never {
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

// ─── Tools ───────────────────────────────────────────────────────────────────

export async function listPagesTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listPagesSchema.parse(args ?? {});
    const response = await client.listPages({
      ...(params.project_id !== undefined ? { project_id: params.project_id } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    });

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
    handleError(error);
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
    handleError(error);
  }
}

export async function createPageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createPageSchema.parse(args);
    const response = await client.createPage({
      project_id: params.project_id,
      title: params.title,
      ...(params.body !== undefined ? { body: params.body } : {}),
      ...(params.parent_page_id !== undefined ? { parent_page_id: params.parent_page_id } : {}),
    });

    const page = response.data;
    let text = `Page created successfully!\n`;
    text += `Title: ${page.attributes.title} (ID: ${page.id})\n`;
    text += `Project ID: ${params.project_id}`;
    if (params.parent_page_id) text += `\nParent Page ID: ${params.parent_page_id}`;
    if (page.attributes.created_at) text += `\nCreated: ${page.attributes.created_at}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function updatePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updatePageSchema.parse(args);
    if (params.title === undefined && params.body === undefined) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one of title or body must be provided');
    }

    const response = await client.updatePage(params.page_id, {
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.body !== undefined ? { body: params.body } : {}),
    });

    const page = response.data;
    let text = `Page ${page.id} updated.\n`;
    text += `Title: ${page.attributes.title}`;
    if (page.attributes.updated_at) text += `\nUpdated: ${page.attributes.updated_at}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function deletePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deletePageSchema.parse(args);
    await client.deletePage(params.page_id);
    return {
      content: [{ type: 'text', text: `Page ${params.page_id} deleted.` }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function movePageTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = movePageSchema.parse(args);
    const response = await client.movePage(params.page_id, params.target_doc_id);
    const newParent = response.data.relationships?.parent?.data?.id ?? params.target_doc_id;
    return {
      content: [{
        type: 'text',
        text: `Page ${params.page_id} moved under parent page ${newParent}.`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function copyPageTool(
  _client: ProductiveAPIClient,
  _args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  throw new McpError(
    ErrorCode.InvalidRequest,
    'copy_page is not supported: the Productive API does not provide a page copy endpoint. Create a new page manually instead.'
  );
}

// ─── Definitions ─────────────────────────────────────────────────────────────

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

export const createPageDefinition = {
  name: 'create_page',
  description: 'Create a new knowledge base page in a project. Optionally nest under a parent page.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'The ID of the project to create the page in' },
      title: { type: 'string', description: 'Title of the new page' },
      body: { type: 'string', description: 'Optional HTML body for the page' },
      parent_page_id: { type: 'string', description: 'Optional parent page ID to nest the new page under' },
    },
    required: ['project_id', 'title'],
  },
};

export const updatePageDefinition = {
  name: 'update_page',
  description: 'Update the title and/or body of an existing page. At least one field must be provided.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the page to update' },
      title: { type: 'string', description: 'New title for the page (optional)' },
      body: { type: 'string', description: 'New HTML body for the page (optional)' },
    },
    required: ['page_id'],
  },
};

export const deletePageDefinition = {
  name: 'delete_page',
  description: 'Delete a knowledge base page. This action is destructive.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the page to delete' },
    },
    required: ['page_id'],
  },
};

export const movePageDefinition = {
  name: 'move_page',
  description: 'Move a page so that it becomes a child of another page (a new parent).',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      page_id: { type: 'string', description: 'The ID of the page to move' },
      target_doc_id: { type: 'string', description: 'The ID of the page that will become the new parent' },
    },
    required: ['page_id', 'target_doc_id'],
  },
};

export const copyPageDefinition = {
  name: 'copy_page',
  description: 'Copy a page to create a new page from a template. Optionally specify a destination project.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: 'The ID of the source page to copy from' },
      project_id: { type: 'string', description: 'Optional destination project ID (defaults to source project)' },
    },
    required: ['template_id'],
  },
};
