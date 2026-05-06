import type { Requester } from './_requester.js';
import type {
  ProductiveAttachment,
  ProductiveResponse,
} from '../types.js';

export interface ListAttachmentsParams {
  task_id?: string;
  comment_id?: string;
  limit?: number;
}

export function listAttachments(
  request: Requester,
  params: ListAttachmentsParams
): Promise<ProductiveResponse<ProductiveAttachment>> {
  const qs = new URLSearchParams();
  if (params.task_id) {
    qs.append('filter[attachable_id]', params.task_id);
    qs.append('filter[attachable_type]', 'Task');
  } else if (params.comment_id) {
    qs.append('filter[attachable_id]', params.comment_id);
    qs.append('filter[attachable_type]', 'Comment');
  }
  if (params.limit !== undefined) {
    qs.append('page[size]', params.limit.toString());
  }
  return request<ProductiveResponse<ProductiveAttachment>>(
    `attachments?${qs.toString()}`
  );
}
