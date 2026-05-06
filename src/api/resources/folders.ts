import type { Requester } from './_requester.js';
import type {
  ProductiveFolder,
  ProductiveFolderCreate,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListFoldersParams {
  project_id?: string;
  status?: number; // 1=active, 2=archived
  limit?: number;
  page?: number;
}

export function listFolders(
  request: Requester,
  params?: ListFoldersParams
): Promise<ProductiveResponse<ProductiveFolder>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  if (params?.status !== undefined) {
    qs.append('filter[status]', params.status.toString());
  }
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductiveFolder>>(
    withQuery('folders', qs)
  );
}

export function getFolder(
  request: Requester,
  folderId: string
): Promise<ProductiveSingleResponse<ProductiveFolder>> {
  return request<ProductiveSingleResponse<ProductiveFolder>>(
    `folders/${folderId}`
  );
}

export function createFolder(
  request: Requester,
  data: ProductiveFolderCreate
): Promise<ProductiveSingleResponse<ProductiveFolder>> {
  return request<ProductiveSingleResponse<ProductiveFolder>>('folders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateFolder(
  request: Requester,
  folderId: string,
  attrs: { name: string }
): Promise<ProductiveSingleResponse<ProductiveFolder>> {
  return request<ProductiveSingleResponse<ProductiveFolder>>(
    `folders/${folderId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'folders', id: folderId, attributes: attrs },
      }),
    }
  );
}

export function archiveFolder(
  request: Requester,
  folderId: string
): Promise<ProductiveSingleResponse<ProductiveFolder>> {
  return request<ProductiveSingleResponse<ProductiveFolder>>(
    `folders/${folderId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'folders', id: folderId, attributes: { archived_at: new Date().toISOString() } },
      }),
    }
  );
}

export function restoreFolder(
  request: Requester,
  folderId: string
): Promise<ProductiveSingleResponse<ProductiveFolder>> {
  return request<ProductiveSingleResponse<ProductiveFolder>>(
    `folders/${folderId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: { type: 'folders', id: folderId, attributes: { archived_at: null } },
      }),
    }
  );
}
