import type { Requester } from './_requester.js';
import type {
  ProductiveBoard,
  ProductiveBoardCreate,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListBoardsParams {
  project_id?: string;
  limit?: number;
  page?: number;
}

export function listBoards(
  request: Requester,
  params?: ListBoardsParams
): Promise<ProductiveResponse<ProductiveBoard>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveBoard>>(withQuery('boards', qs));
}

export function createBoard(
  request: Requester,
  boardData: ProductiveBoardCreate
): Promise<ProductiveSingleResponse<ProductiveBoard>> {
  return request<ProductiveSingleResponse<ProductiveBoard>>('boards', {
    method: 'POST',
    body: JSON.stringify(boardData),
  });
}
