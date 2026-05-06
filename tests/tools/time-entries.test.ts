/**
 * Tests for time-entries tools. VAL-FOUNDATION-003 (rename), 010, 011.
 */
import { describe, it, expect } from 'vitest';
import {
  listTimeEntriesTool,
  createTimeEntryTool,
  updateTimeEntryTool,
  deleteTimeEntryTool,
  listServicesTool,
  getProjectServicesTool,
  listProjectDealsTool,
  listDealServicesTool,
} from '../../src/tools/time-entries.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool, TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

const timeEntryFixture = {
  data: [
    {
      id: '5001',
      type: 'time_entries',
      attributes: {
        date: '2026-05-01',
        time: 120,
        billable_time: 90,
        note: 'Refactor + tests',
      },
      relationships: {
        person: { data: { id: '12', type: 'people' } },
        service: { data: { id: '500', type: 'services' } },
        task: { data: { id: '7001', type: 'tasks' } },
      },
    },
  ],
  meta: { total_count: 1 },
};

describe('list_time_entries (renamed export)', () => {
  it('renders time entries with totals', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/time_entries/, body: timeEntryFixture }],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listTimeEntriesTool(
          client,
          { date: '2026-05-01' },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
      }
    );
    expect(result.content[0]?.text).toMatch(/Total Time/);
    expect(result.content[0]?.text).toMatch(/Refactor/);
  });

  it('shows empty message', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listTimeEntriesTool(client, {}, undefined);
      }
    );
    expect(result.content[0]?.text).toMatch(/No time entries/);
  });

  it('rejects "me" without PRODUCTIVE_USER_ID configured', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    await expect(
      listTimeEntriesTool(client, { person_id: 'me' }, {})
    ).rejects.toThrow(/me/);
  });
});

describe('create_time_entry', () => {
  it('creates a time entry', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: '6001',
              type: 'time_entries',
              attributes: {
                date: '2026-05-01',
                time: 60,
                note: 'work session detail',
              },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return createTimeEntryTool(
          client,
          {
            date: '2026-05-01',
            time: '1h',
            person_id: 'user-12',
            service_id: '500',
            note: 'work session detail',
            confirm: true,
          },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(created|success|logged|added)/
    );
  });

  it('rejects invalid time format', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    await expect(
      createTimeEntryTool(
        client,
        {
          date: '2026-05-01',
          time: 'not-time',
          person_id: 'user-12',
          service_id: '500',
          note: 'a sufficiently long note',
          confirm: true,
        },
        { PRODUCTIVE_USER_ID: 'user-12' }
      )
    ).rejects.toThrow();
  });
});

describe('update_time_entry', () => {
  it('updates and reports', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries\/5001/,
          method: 'PATCH',
          body: {
            data: {
              id: '5001',
              type: 'time_entries',
              attributes: { date: '2026-05-01', time: 120, note: 'updated note' },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return updateTimeEntryTool(client, {
          time_entry_id: '5001',
          time: '2h',
          note: 'updated note',
        });
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(updated|saved|success)/
    );
  });
});

describe('delete_time_entry', () => {
  it('deletes successfully on 204', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries\/5001/,
          method: 'DELETE',
          status: 204,
          body: '',
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return deleteTimeEntryTool(client, { time_entry_id: '5001' });
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(deleted|removed|success)/
    );
  });

  it('throws on 404', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/time_entries\/missing/,
          method: 'DELETE',
          status: 404,
          body: { errors: [{ detail: 'No such entry' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(
          deleteTimeEntryTool(client, { time_entry_id: 'missing' })
        ).rejects.toThrow();
      }
    );
  });
});

describe('list_services / get_project_services / list_project_deals / list_deal_services', () => {
  it('list_services renders services', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/services/,
          body: {
            data: [
              { id: '500', type: 'services', attributes: { name: 'Dev hours' } },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listServicesTool, {})
    );
    expect(result.content[0]?.text).toMatch(/Dev hours/);
  });

  it('get_project_services rejects without project_id', async () => {
    await expect(runTool(getProjectServicesTool, {})).rejects.toThrow();
  });

  it('list_project_deals renders deals', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/deals/,
          body: {
            data: [
              {
                id: '900',
                type: 'deals',
                attributes: { name: 'Retainer 2026', budget: true },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listProjectDealsTool, { project_id: '5001' })
    );
    expect(result.content[0]?.text).toMatch(/Retainer 2026/);
  });

  it('list_deal_services renders services', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/services/,
          body: {
            data: [{ id: '510', type: 'services', attributes: { name: 'Design' } }],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listDealServicesTool, { deal_id: '900' })
    );
    expect(result.content[0]?.text).toMatch(/Design/);
  });
});
