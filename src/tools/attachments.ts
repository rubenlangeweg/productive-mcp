import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listAttachmentsSchema = z.object({
  task_id: z.string().optional(),
  comment_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
}).refine(data => data.task_id ?? data.comment_id, {
  message: 'Either task_id or comment_id is required',
});

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listAttachmentsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listAttachmentsSchema.parse(args ?? {});
    const response = await client.listAttachments({
      task_id: params.task_id,
      comment_id: params.comment_id,
      limit: params.limit,
    });

    if (!response.data || response.data.length === 0) {
      const context = params.task_id ? `task ${params.task_id}` : `comment ${params.comment_id}`;
      return {
        content: [{ type: 'text', text: `No attachments found for ${context}.` }],
      };
    }

    const items = response.data.map(att => {
      const size = formatFileSize(att.attributes.filesize);
      return `• ${att.attributes.filename} (ID: ${att.id})
  Type: ${att.attributes.content_type ?? 'unknown'}
  Size: ${size}
  ${att.attributes.url ? `URL: ${att.attributes.url}` : ''}
  Uploaded: ${att.attributes.created_at}`;
    }).join('\n\n');

    const context = params.task_id ? `task ${params.task_id}` : `comment ${params.comment_id}`;
    return {
      content: [{
        type: 'text',
        text: `Attachments for ${context} (${response.data.length} found):\n\n${items}`,
      }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listAttachmentsDefinition = {
  name: 'list_attachments',
  description: 'List file attachments on a task or comment in Productive.io. Returns filenames, types, sizes, and download URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task to list attachments for' },
      comment_id: { type: 'string', description: 'The ID of the comment to list attachments for' },
      limit: {
        type: 'number',
        description: 'Number of attachments to return (1-200, default 30)',
        minimum: 1,
        maximum: 200,
        default: 30,
      },
    },
  },
};
