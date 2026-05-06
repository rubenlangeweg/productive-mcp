import type { Requester } from './_requester.js';
import type {
  ProductivePage,
  ProductiveResponse,
  ProductiveSingleResponse,
} from '../types.js';
import { appendFilter, appendPagination, withQuery } from './_query.js';

export interface ListPagesParams {
  project_id?: string;
  limit?: number;
  page?: number;
}

export function listPages(
  request: Requester,
  params?: ListPagesParams
): Promise<ProductiveResponse<ProductivePage>> {
  const qs = new URLSearchParams();
  appendFilter(qs, 'project_id', params?.project_id);
  appendPagination(qs, params);
  return request<ProductiveResponse<ProductivePage>>(withQuery('pages', qs));
}

export function getPage(
  request: Requester,
  pageId: string
): Promise<ProductiveSingleResponse<ProductivePage>> {
  return request<ProductiveSingleResponse<ProductivePage>>(`pages/${pageId}`);
}

export interface CreatePageInput {
  project_id: string;
  title: string;
  body?: string;
  parent_page_id?: string;
}

export function createPage(
  request: Requester,
  input: CreatePageInput
): Promise<ProductiveSingleResponse<ProductivePage>> {
  const relationships: Record<string, { data: { id: string; type: string } }> = {
    project: { data: { id: input.project_id, type: 'projects' } },
  };
  if (input.parent_page_id) {
    relationships.parent = {
      data: { id: input.parent_page_id, type: 'pages' },
    };
  }
  const attributes: { title: string; content?: string } = { title: input.title };
  if (input.body !== undefined) attributes.content = input.body;

  return request<ProductiveSingleResponse<ProductivePage>>('pages', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'pages',
        attributes,
        relationships,
      },
    }),
  });
}

export interface UpdatePageInput {
  title?: string;
  body?: string;
}

export function updatePage(
  request: Requester,
  pageId: string,
  input: UpdatePageInput
): Promise<ProductiveSingleResponse<ProductivePage>> {
  const attributes: { title?: string; content?: string } = {};
  if (input.title !== undefined) attributes.title = input.title;
  if (input.body !== undefined) attributes.content = input.body;
  return request<ProductiveSingleResponse<ProductivePage>>(`pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: { type: 'pages', id: pageId, attributes },
    }),
  });
}

export function deletePage(
  request: Requester,
  pageId: string
): Promise<void> {
  return request<void>(`pages/${pageId}`, { method: 'DELETE' });
}

export function movePage(
  request: Requester,
  pageId: string,
  targetDocId: string
): Promise<ProductiveSingleResponse<ProductivePage>> {
  return request<ProductiveSingleResponse<ProductivePage>>(
    `pages/${pageId}/move`,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'pages',
          id: pageId,
          relationships: {
            parent: { data: { id: targetDocId, type: 'pages' } },
          },
        },
      }),
    }
  );
}

export function copyPage(
  request: Requester,
  templateId: string,
  projectId?: string
): Promise<ProductiveSingleResponse<ProductivePage>> {
  const body: { data: { relationships?: { project?: { data: { id: string; type: string } } } } } = {
    data: {},
  };
  if (projectId) {
    body.data.relationships = {
      project: { data: { id: projectId, type: 'projects' } },
    };
  }
  return request<ProductiveSingleResponse<ProductivePage>>(
    `pages/${templateId}/copy`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}
