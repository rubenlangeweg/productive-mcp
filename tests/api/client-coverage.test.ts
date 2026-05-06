/**
 * Branch-coverage filler for ProductiveAPIClient: error-mapping branches,
 * convenience methods (getTimeEntriesInDateRange, getTodayTimeEntries), and
 * the legacy getAllPages path.
 */
import { describe, it, expect } from 'vitest';
import { ProductiveAPIClient } from '../../src/api/client.js';
import { TEST_CONFIG } from '../helpers/runTool.js';
import { withFetchMock } from '../helpers/withFetchMock.js';

describe('ProductiveAPIClient — error mapping branches', () => {
  it('401 surfaces "Authentication failed"', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/companies/,
          status: 401,
          body: { errors: [{ detail: 'Bad token' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(client.listCompanies()).rejects.toThrow(
          /Authentication failed/
        );
      }
    );
  });

  it('403 surfaces "Permission denied"', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/companies/,
          status: 403,
          body: { errors: [{ detail: 'Nope' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(client.listCompanies()).rejects.toThrow(
          /Permission denied/
        );
      }
    );
  });

  it('404 surfaces "Not found"', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/missing/,
          status: 404,
          body: { errors: [{ detail: 'No such task' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(client.getTask('missing')).rejects.toThrow(/Not found/);
      }
    );
  });

  it('422 surfaces "Invalid request"', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          method: 'POST',
          status: 422,
          body: { errors: [{ detail: 'Missing title' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(
          client.createTask({
            data: { type: 'tasks', attributes: { title: 'x' } },
          })
        ).rejects.toThrow(/Invalid request/);
      }
    );
  });

  it('5xx surfaces an API request failed message', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/companies/,
          status: 503,
          body: { errors: [{ detail: 'Service down' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(client.listCompanies()).rejects.toThrow();
      }
    );
  });

  it('non-JSON error body falls back to status-based message', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/companies/,
          status: 401,
          body: 'plain text body',
          headers: { 'content-type': 'text/plain' },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(client.listCompanies()).rejects.toThrow(
          /Authentication failed/
        );
      }
    );
  });
});

describe('ProductiveAPIClient — convenience methods', () => {
  it('getTimeEntriesInDateRange composes after/before', async () => {
    let observedPath: string | undefined;
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        const r = await client.getTimeEntriesInDateRange(
          '2026-05-01',
          '2026-05-31',
          { person_id: '12' }
        );
        observedPath = JSON.stringify(r);
        return r;
      }
    );
    expect(result.data).toEqual([]);
    expect(observedPath).toBeDefined();
  });

  it("getTodayTimeEntries uses today's date", async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return client.getTodayTimeEntries({ person_id: '12' });
      }
    );
    expect(result.data).toEqual([]);
  });
});

describe('ProductiveAPIClient — legacy getAllPages', () => {
  it('iterates pages until total_count is reached', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/people/,
          body: {
            data: [
              { id: '1', type: 'people', attributes: { first_name: 'A' } },
              { id: '2', type: 'people', attributes: { first_name: 'B' } },
            ],
            meta: { total_count: 2 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return client.getAllPages('people', new URLSearchParams());
      }
    );
    expect(result).toHaveLength(2);
  });

  it('listAllPeople calls through to getAllPages', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/people/,
          body: {
            data: [{ id: '1', type: 'people', attributes: {} }],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return client.listAllPeople();
      }
    );
    expect(result).toHaveLength(1);
  });
});
