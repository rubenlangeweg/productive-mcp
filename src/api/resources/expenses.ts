import type { Requester } from './_requester.js';
import type {
  ProductiveExpense,
  ProductiveExpenseCreate,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListExpensesParams {
  person_id?: string;
  project_id?: string;
  after?: string;
  before?: string;
  limit?: number;
  page?: number;
}

export function listExpenses(
  request: Requester,
  params?: ListExpensesParams
): Promise<ProductiveResponse<ProductiveExpense>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'person_id', params?.person_id);
  appendFilter(qs, 'project_id', params?.project_id);
  appendFilter(qs, 'after', params?.after);
  appendFilter(qs, 'before', params?.before);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveExpense>>(
    withQuery('expenses', qs)
  );
}

export function createExpense(
  request: Requester,
  data: ProductiveExpenseCreate
): Promise<ProductiveSingleResponse<ProductiveExpense>> {
  return request<ProductiveSingleResponse<ProductiveExpense>>('expenses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
