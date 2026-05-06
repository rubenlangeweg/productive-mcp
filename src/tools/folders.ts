import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const listFoldersSchema = z.object({
  project_id: z.string().optional(),
  status: z.number().int().min(1).max(2).default(1).optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getFolderSchema = z.object({
  folder_id: z.string().min(1, 'Folder ID is required'),
});

const createFolderSchema = z.object({
  project_id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Folder name is required'),
});

const updateFolderSchema = z.object({
  folder_id: z.string().min(1, 'Folder ID is required'),
  name: z.string().min(1, 'Folder name is required'),
});

const folderIdOnlySchema = z.object({
  folder_id: z.string().min(1, 'Folder ID is required'),
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

const STATUS_LABELS: Record<number, string> = { 1: 'active', 2: 'archived' };

// ─── Tools ───────────────────────────────────────────────────────────────────

export async function listFoldersTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listFoldersSchema.parse(args ?? {});
    const status = params.status ?? 1;
    const response = await client.listFolders({
      ...(params.project_id !== undefined ? { project_id: params.project_id } : {}),
      status,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    });

    if (!response.data?.length) {
      const ctx = params.project_id ? `project ${params.project_id}` : 'organisation';
      return {
        content: [{ type: 'text', text: `No ${STATUS_LABELS[status]} folders found in ${ctx}.` }],
      };
    }

    const items = response.data.map(f => {
      const projectId = f.relationships?.project?.data?.id;
      let line = `• ${f.attributes.name} (ID: ${f.id})`;
      if (projectId) line += `\n  Project ID: ${projectId}`;
      if (f.attributes.position !== undefined) line += `\n  Position: ${f.attributes.position}`;
      return line;
    }).join('\n\n');

    const total = response.meta?.total_count ?? response.data.length;
    return {
      content: [{
        type: 'text',
        text: `${STATUS_LABELS[status]} folders (${response.data.length}${total !== response.data.length ? ` of ${total}` : ''}):\n\n${items}`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function getFolderTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getFolderSchema.parse(args);
    const response = await client.getFolder(params.folder_id);
    const f = response.data;
    const projectId = f.relationships?.project?.data?.id;
    let text = `Folder: ${f.attributes.name} (ID: ${f.id})\n`;
    if (projectId) text += `Project ID: ${projectId}\n`;
    if (f.attributes.status !== undefined) {
      text += `Status: ${STATUS_LABELS[f.attributes.status] ?? f.attributes.status}\n`;
    }
    if (f.attributes.position !== undefined) text += `Position: ${f.attributes.position}\n`;
    if (f.attributes.created_at) text += `Created: ${f.attributes.created_at}\n`;
    if (f.attributes.updated_at) text += `Updated: ${f.attributes.updated_at}`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function createFolderTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = createFolderSchema.parse(args);
    const response = await client.createFolder({
      data: {
        type: 'folders',
        attributes: { name: params.name },
        relationships: {
          project: { data: { id: params.project_id, type: 'projects' } },
        },
      },
    });
    const f = response.data;
    let text = `Folder created successfully!\n`;
    text += `Name: ${f.attributes.name} (ID: ${f.id})\n`;
    text += `Project ID: ${params.project_id}`;
    if (f.attributes.created_at) text += `\nCreated: ${f.attributes.created_at}`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function updateFolderTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateFolderSchema.parse(args);
    const response = await client.updateFolder(params.folder_id, { name: params.name });
    return {
      content: [{
        type: 'text',
        text: `Folder ${response.data.id} renamed to "${response.data.attributes.name}".`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function archiveFolderTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = folderIdOnlySchema.parse(args);
    await client.archiveFolder(params.folder_id);
    return {
      content: [{ type: 'text', text: `Folder ${params.folder_id} archived. Use restore_folder to bring it back.` }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function restoreFolderTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = folderIdOnlySchema.parse(args);
    const response = await client.restoreFolder(params.folder_id);
    return {
      content: [{
        type: 'text',
        text: `Folder ${response.data.id} restored.`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export const listFoldersDefinition = {
  name: 'list_folders',
  description: 'List folders that group boards within projects. Filter by project and active/archived status.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter folders by project ID' },
      status: { type: 'number', description: 'Status: 1=active, 2=archived (default 1)', enum: [1, 2], default: 1 },
      limit: { type: 'number', description: 'Number of folders to return (1-200, default 30)', minimum: 1, maximum: 200, default: 30 },
    },
  },
};

export const getFolderDefinition = {
  name: 'get_folder',
  description: 'Get details of a specific folder by its ID.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: { type: 'string', description: 'The ID of the folder' },
    },
    required: ['folder_id'],
  },
};

export const createFolderDefinition = {
  name: 'create_folder',
  description: 'Create a new folder inside a project to group boards.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'The ID of the project the folder belongs to' },
      name: { type: 'string', description: 'Folder name' },
    },
    required: ['project_id', 'name'],
  },
};

export const updateFolderDefinition = {
  name: 'update_folder',
  description: 'Rename an existing folder.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: { type: 'string', description: 'The ID of the folder to rename' },
      name: { type: 'string', description: 'New folder name' },
    },
    required: ['folder_id', 'name'],
  },
};

export const archiveFolderDefinition = {
  name: 'archive_folder',
  description: 'Archive a folder. This is reversible — use restore_folder to undo.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: { type: 'string', description: 'The ID of the folder to archive' },
    },
    required: ['folder_id'],
  },
};

export const restoreFolderDefinition = {
  name: 'restore_folder',
  description: 'Restore a previously archived folder.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      folder_id: { type: 'string', description: 'The ID of the folder to restore' },
    },
    required: ['folder_id'],
  },
};
