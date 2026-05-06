import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const listAttachmentsSchema = z.object({
  task_id: z.string().optional(),
  comment_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
}).refine(data => data.task_id ?? data.comment_id, { message: 'Either task_id or comment_id is required' });

export const listAttachmentsOutputSchema = z.object({
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string().optional(),
    contentType: z.string().optional(),
    filesize: z.number().optional(),
    url: z.string().optional(),
    createdAt: z.string().optional(),
  })),
  returned: z.number(),
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
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: z.infer<typeof listAttachmentsOutputSchema> }> {
  try {
    const params = listAttachmentsSchema.parse(args ?? {});
    const response = await client.listAttachments({ task_id: params.task_id, comment_id: params.comment_id, limit: params.limit });

    if (!response.data?.length) {
      const ctx = params.task_id ? `task ${params.task_id}` : `comment ${params.comment_id}`;
      return {
        content: [{ type: 'text', text: `No attachments found for ${ctx}.` }],
        structuredContent: { attachments: [], returned: 0 },
      };
    }

    const attachments = response.data.map(a => ({
      id: a.id,
      ...(a.attributes.filename ? { filename: a.attributes.filename } : {}),
      ...(a.attributes.content_type ? { contentType: a.attributes.content_type } : {}),
      ...(a.attributes.filesize != null ? { filesize: a.attributes.filesize } : {}),
      ...(a.attributes.url ? { url: a.attributes.url } : {}),
      ...(a.attributes.created_at ? { createdAt: a.attributes.created_at } : {}),
    }));

    const ctx = params.task_id ? `task ${params.task_id}` : `comment ${params.comment_id}`;
    const text = attachments.map(a =>
      `• ${a.filename ?? '(unnamed)'} (ID: ${a.id})\n  Type: ${a.contentType ?? 'unknown'}\n  Size: ${formatFileSize(a.filesize)}${a.url ? `\n  URL: ${a.url}` : ''}${a.createdAt ? `\n  Uploaded: ${a.createdAt}` : ''}`
    ).join('\n\n');

    const n = attachments.length;
    return {
      content: [{ type: 'text', text: `Attachments for ${ctx} (${n} found):\n\n${text}` }],
      structuredContent: { attachments, returned: n },
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const listAttachmentsDefinition = {
  name: 'list_attachments',
  description: 'List file attachments on a task or comment in Productive.io. Returns filenames, types, sizes, and download URLs.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List attachments' },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The ID of the task to list attachments for' },
      comment_id: { type: 'string', description: 'The ID of the comment to list attachments for' },
      limit: { type: 'number', description: 'Number of attachments to return (1-200, default 30)', minimum: 1, maximum: 200, default: 30 },
    },
  },
  outputSchema: listAttachmentsOutputSchema.shape,
};
