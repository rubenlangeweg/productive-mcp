import type { Requester } from './_requester.js';
import type {
  ProductiveInvoice,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListInvoicesParams {
  company_id?: string;
  project_id?: string;
  status?: number;
  after?: string;
  before?: string;
  limit?: number;
  page?: number;
}

export function listInvoices(
  request: Requester,
  params?: ListInvoicesParams
): Promise<ProductiveResponse<ProductiveInvoice>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'company_id', params?.company_id);
  appendFilter(qs, 'project_id', params?.project_id);
  if (params?.status !== undefined) {
    qs.append('filter[status]', params.status.toString());
  }
  appendFilter(qs, 'after', params?.after);
  appendFilter(qs, 'before', params?.before);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveInvoice>>(
    withQuery('invoices', qs)
  );
}

export function getInvoice(
  request: Requester,
  invoiceId: string
): Promise<ProductiveSingleResponse<ProductiveInvoice>> {
  return request<ProductiveSingleResponse<ProductiveInvoice>>(
    `invoices/${invoiceId}`
  );
}
