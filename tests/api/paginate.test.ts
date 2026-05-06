/**
 * Tests for `paginateAll`.
 *
 * Verifies VAL-FOUNDATION-008 (list endpoints auto-paginate by default;
 * cap honoured).
 */
import { describe, it, expect } from 'vitest';
import { Core } from '../../src/api/core.js';
import { paginateAll } from '../../src/api/paginate.js';
import { withFetchMock } from '../helpers/withFetchMock.js';

const ORIGIN = 'https://api.productive.io';

function makeCore(): Core {
  return new Core({
    apiToken: 'test-token',
    organizationId: 'test-org',
    baseUrl: 'https://api.productive.io/api/v2/',
  });
}

function pageBody(start: number, size: number, total: number, nextUrl?: string) {
  const data = Array.from({ length: size }, (_, i) => ({
    id: String(start + i),
    type: 'tasks',
    attributes: { title: `t${start + i}` },
  }));
  return {
    data,
    meta: {
      current_page: Math.floor(start / size) + 1,
      total_pages: Math.ceil(total / size),
      total_count: total,
      page_size: size,
      max_page_size: 200,
    },
    links: {
      self: `${ORIGIN}/api/v2/tasks?page[number]=${Math.floor(start / size) + 1}`,
      ...(nextUrl !== undefined ? { next: nextUrl } : {}),
    },
  };
}

describe('paginateAll', () => {
  it('follows links.next until total_count is exhausted', async () => {
    const total = 600;
    const size = 200;
    const page1Url = `${ORIGIN}/api/v2/tasks?page%5Bnumber%5D=2&page%5Bsize%5D=200`;
    const page2Url = `${ORIGIN}/api/v2/tasks?page%5Bnumber%5D=3&page%5Bsize%5D=200`;

    const result = await withFetchMock(
      [
        { path: /\/api\/v2\/tasks\?page%5Bsize%5D=200$/, body: pageBody(1, size, total, page1Url) },
        { path: /\/api\/v2\/tasks\?page%5Bnumber%5D=2/, body: pageBody(201, size, total, page2Url) },
        { path: /\/api\/v2\/tasks\?page%5Bnumber%5D=3/, body: pageBody(401, size, total) },
      ],
      async () => {
        const core = makeCore();
        return paginateAll(core, 'tasks', new URLSearchParams(), {
          cap: 1000,
        });
      }
    );

    expect(result).toHaveLength(600);
    expect(result[0]?.id).toBe('1');
    expect(result[599]?.id).toBe('600');
  });

  it('stops when the cap is reached even if total_count is larger', async () => {
    const total = 600;
    const size = 200;
    const page1Url = `${ORIGIN}/api/v2/tasks?page%5Bnumber%5D=2&page%5Bsize%5D=200`;

    const result = await withFetchMock(
      [
        { path: /\/api\/v2\/tasks\?page%5Bsize%5D=200$/, body: pageBody(1, size, total, page1Url) },
        { path: /\/api\/v2\/tasks\?page%5Bnumber%5D=2/, body: pageBody(201, size, total) },
      ],
      async () => {
        const core = makeCore();
        return paginateAll(core, 'tasks', new URLSearchParams(), { cap: 250 });
      }
    );

    expect(result).toHaveLength(250);
  });

  it('returns an empty array when the first page is empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\?page%5Bsize%5D=200$/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const core = makeCore();
        return paginateAll(core, 'tasks');
      }
    );
    expect(result).toEqual([]);
  });

  it('stops when there is no next link, regardless of total_count', async () => {
    const result = await withFetchMock(
      [
        {
          // single page, total_count higher than what we got
          path: /\/api\/v2\/tasks/,
          body: pageBody(1, 30, 100),
        },
      ],
      async () => {
        const core = makeCore();
        return paginateAll(core, 'tasks');
      }
    );
    // total_count says 100 but no next link is present, so we trust the API.
    expect(result).toHaveLength(30);
  });
});
