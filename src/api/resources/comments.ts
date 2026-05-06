import type { Requester } from './_requester.js';
import type {
  ProductiveComment,
  ProductiveCommentCreate,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListCommentsParams {
  task_id: string;
  project_id?: string;
  limit?: number;
  page?: number;
}

export function listComments(
  request: Requester,
  params: ListCommentsParams
): Promise<ProductiveResponse<ProductiveComment>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'task_id', params.task_id);
  appendFilter(qs, 'project_id', params.project_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveComment>>(
    withQuery('comments', qs)
  );
}

export function getComment(
  request: Requester,
  commentId: string
): Promise<ProductiveSingleResponse<ProductiveComment>> {
  return request<ProductiveSingleResponse<ProductiveComment>>(
    `comments/${commentId}`
  );
}

export function createComment(
  request: Requester,
  commentData: ProductiveCommentCreate
): Promise<ProductiveSingleResponse<ProductiveComment>> {
  return request<ProductiveSingleResponse<ProductiveComment>>('comments', {
    method: 'POST',
    body: JSON.stringify(commentData),
  });
}

export function updateComment(
  request: Requester,
  commentId: string,
  attrs: { body?: string; pinned?: boolean }
): Promise<ProductiveSingleResponse<ProductiveComment>> {
  return request<ProductiveSingleResponse<ProductiveComment>>(
    `comments/${commentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'comments',
          id: commentId,
          attributes: attrs,
        },
      }),
    }
  );
}

export function deleteComment(
  request: Requester,
  commentId: string
): Promise<void> {
  return request<void>(`comments/${commentId}`, { method: 'DELETE' });
}

export function addCommentReaction(
  request: Requester,
  commentId: string,
  reaction: string
): Promise<ProductiveSingleResponse<{ id: string; type: string; attributes: Record<string, unknown> }>> {
  return request<ProductiveSingleResponse<{ id: string; type: string; attributes: Record<string, unknown> }>>(
    'reactions',
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'reactions',
          attributes: { reaction },
          relationships: {
            comment: {
              data: { id: commentId, type: 'comments' },
            },
          },
        },
      }),
    }
  );
}
