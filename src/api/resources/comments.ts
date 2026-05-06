import type { Requester } from './_requester.js';
import type {
  ProductiveComment,
  ProductiveCommentCreate,
  ProductiveSingleResponse,
} from '../types.js';

export function createComment(
  request: Requester,
  commentData: ProductiveCommentCreate
): Promise<ProductiveSingleResponse<ProductiveComment>> {
  return request<ProductiveSingleResponse<ProductiveComment>>('comments', {
    method: 'POST',
    body: JSON.stringify(commentData),
  });
}
