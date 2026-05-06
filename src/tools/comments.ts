import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addTaskCommentSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  comment: z.string().min(1, 'Comment text is required'),
});

const listCommentsSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  project_id: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
});

const getCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

const updateCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
  body: z.string().min(1, 'Comment body is required'),
});

const deleteCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

const pinCommentSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
});

const reactionSchema = z.object({
  comment_id: z.string().min(1, 'Comment ID is required'),
  reaction: z.string().min(1, 'Reaction is required'),
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

function summariseComment(c: { id: string; attributes: { body: string; created_at?: string; pinned_at?: string; edited_at?: string } }): string {
  let line = `• [${c.id}] ${c.attributes.body}`;
  const meta: string[] = [];
  if (c.attributes.pinned_at) meta.push('pinned');
  if (c.attributes.edited_at) meta.push(`edited ${c.attributes.edited_at}`);
  if (c.attributes.created_at) meta.push(`created ${c.attributes.created_at}`);
  if (meta.length) line += `\n  (${meta.join(', ')})`;
  return line;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export async function addTaskCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = addTaskCommentSchema.parse(args);

    const response = await client.createComment({
      data: {
        type: 'comments',
        attributes: { body: params.comment },
        relationships: {
          task: { data: { id: params.task_id, type: 'tasks' } },
        },
      },
    });

    let text = `Comment added successfully!\n`;
    text += `Task ID: ${params.task_id}\n`;
    text += `Comment: ${response.data.attributes.body}\n`;
    text += `Comment ID: ${response.data.id}`;
    if (response.data.attributes.created_at) {
      text += `\nCreated at: ${response.data.attributes.created_at}`;
    }

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function listCommentsTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = listCommentsSchema.parse(args);
    const response = await client.listComments({
      task_id: params.task_id,
      ...(params.project_id !== undefined ? { project_id: params.project_id } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    });

    if (!response.data?.length) {
      return {
        content: [{ type: 'text', text: `No comments found for task ${params.task_id}.` }],
      };
    }

    const items = response.data.map(summariseComment).join('\n\n');
    const total = response.meta?.total_count ?? response.data.length;
    return {
      content: [{
        type: 'text',
        text: `Comments on task ${params.task_id} (${response.data.length}${total !== response.data.length ? ` of ${total}` : ''}):\n\n${items}`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function getCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = getCommentSchema.parse(args);
    const response = await client.getComment(params.comment_id);
    const c = response.data;
    const taskId = c.relationships?.task?.data?.id;
    const creatorId = c.relationships?.creator?.data?.id;

    let text = `Comment ID: ${c.id}\n`;
    if (taskId) text += `Task ID: ${taskId}\n`;
    if (creatorId) text += `Creator ID: ${creatorId}\n`;
    if (c.attributes.created_at) text += `Created: ${c.attributes.created_at}\n`;
    if (c.attributes.edited_at) text += `Edited: ${c.attributes.edited_at}\n`;
    if (c.attributes.pinned_at) text += `Pinned: ${c.attributes.pinned_at}\n`;
    text += `\nBody:\n${c.attributes.body}`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export async function updateCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateCommentSchema.parse(args);
    const response = await client.updateComment(params.comment_id, { body: params.body });
    return {
      content: [{
        type: 'text',
        text: `Comment ${response.data.id} updated.\n\nNew body:\n${response.data.attributes.body}`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function deleteCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteCommentSchema.parse(args);
    await client.deleteComment(params.comment_id);
    return {
      content: [{ type: 'text', text: `Comment ${params.comment_id} deleted.` }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function pinCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = pinCommentSchema.parse(args);
    const response = await client.updateComment(params.comment_id, { pinned: true });
    return {
      content: [{
        type: 'text',
        text: `Comment ${response.data.id} pinned${response.data.attributes.pinned_at ? ` at ${response.data.attributes.pinned_at}` : ''}.`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function unpinCommentTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = pinCommentSchema.parse(args);
    const response = await client.updateComment(params.comment_id, { pinned: false });
    return {
      content: [{ type: 'text', text: `Comment ${response.data.id} unpinned.` }],
    };
  } catch (error) {
    handleError(error);
  }
}

export async function addCommentReactionTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = reactionSchema.parse(args);
    await client.addCommentReaction(params.comment_id, params.reaction);
    return {
      content: [{
        type: 'text',
        text: `Reaction "${params.reaction}" added to comment ${params.comment_id}.`,
      }],
    };
  } catch (error) {
    handleError(error);
  }
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export const addTaskCommentDefinition = {
  name: 'add_task_comment',
  description: 'Add a comment to a task in Productive.io.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID of the task to add the comment to (required)' },
      comment: { type: 'string', description: 'Text content of the comment (required)' },
    },
    required: ['task_id', 'comment'],
  },
};

export const listCommentsDefinition = {
  name: 'list_comments',
  description: 'List comments on a task in Productive.io.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID of the task whose comments to list' },
      project_id: { type: 'string', description: 'Optional project ID to scope the query' },
      limit: { type: 'number', description: 'Number of comments to return (1-200, default 30)', minimum: 1, maximum: 200, default: 30 },
    },
    required: ['task_id'],
  },
};

export const getCommentDefinition = {
  name: 'get_comment',
  description: 'Get a single comment by ID, including its body and metadata.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment' },
    },
    required: ['comment_id'],
  },
};

export const updateCommentDefinition = {
  name: 'update_comment',
  description: 'Edit the body of an existing comment.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment to update' },
      body: { type: 'string', description: 'New body for the comment' },
    },
    required: ['comment_id', 'body'],
  },
};

export const deleteCommentDefinition = {
  name: 'delete_comment',
  description: 'Delete a comment from Productive.io. This action is destructive.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment to delete' },
    },
    required: ['comment_id'],
  },
};

export const pinCommentDefinition = {
  name: 'pin_comment',
  description: 'Pin a comment so it stays at the top of the task discussion.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment to pin' },
    },
    required: ['comment_id'],
  },
};

export const unpinCommentDefinition = {
  name: 'unpin_comment',
  description: 'Unpin a previously pinned comment.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment to unpin' },
    },
    required: ['comment_id'],
  },
};

export const addCommentReactionDefinition = {
  name: 'add_comment_reaction',
  description: 'Add a reaction emoji (e.g. "like") to a comment.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      comment_id: { type: 'string', description: 'The ID of the comment to react to' },
      reaction: { type: 'string', description: 'The reaction key (e.g. "like", "heart", "thumbs_up")' },
    },
    required: ['comment_id', 'reaction'],
  },
};
