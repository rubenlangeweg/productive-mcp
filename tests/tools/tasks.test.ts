/**
 * Tests for the tasks family of tools. VAL-FOUNDATION-004, 010, 011.
 */
import { describe, it, expect } from 'vitest';
import {
  listTasksTool,
  getProjectTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskAssignmentTool,
  updateTaskDetailsTool,
} from '../../src/tools/tasks.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool, TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

const taskListFixture = {
  data: [
    {
      id: '7001',
      type: 'tasks',
      attributes: {
        title: 'Implement login form',
        closed: false,
        due_date: '2026-06-01',
        description: 'Top of sprint',
      },
      relationships: {
        project: { data: { id: '5001', type: 'projects' } },
        assignee: { data: { id: '12', type: 'people' } },
      },
    },
    {
      id: '7002',
      type: 'tasks',
      attributes: {
        title: 'Wire up auth',
        closed: true,
      },
      relationships: { project: { data: { id: '5001', type: 'projects' } } },
    },
  ],
  meta: { total_count: 2, page_size: 30 },
};

const singleTaskFixture = {
  data: {
    id: '7001',
    type: 'tasks',
    attributes: {
      title: 'Implement login form',
      closed: false,
      due_date: '2026-06-01',
      description: 'Top of sprint',
      task_number: 42,
    },
    relationships: {
      project: { data: { id: '5001', type: 'projects' } },
      assignee: { data: { id: '12', type: 'people' } },
      task_list: { data: { id: '999', type: 'task_lists' } },
    },
  },
  included: [
    {
      id: '999',
      type: 'task_lists',
      attributes: { name: 'Sprint 1' },
    },
  ],
};

describe('list_tasks', () => {
  it('renders open status from `closed: false`', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/tasks/, body: taskListFixture }],
      () => runTool(listTasksTool, { project_id: '5001' })
    );
    expect(result.content[0]?.text).toMatch(/Status: open/);
    expect(result.content[0]?.text).toMatch(/Status: closed/);
    expect(result.content[0]?.text).toMatch(/Implement login form/);
  });

  it('shows no-tasks message on empty', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/tasks/, body: { data: [], meta: { total_count: 0 } } }],
      () => runTool(listTasksTool, {})
    );
    expect(result.content[0]?.text).toMatch(/No tasks found/);
  });

  it('throws on 401', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          status: 401,
          body: { errors: [{ detail: 'Bad token' }] },
        },
      ],
      async () => {
        await expect(runTool(listTasksTool, {})).rejects.toThrow();
      }
    );
  });
});

describe('get_project_tasks', () => {
  it('renders tasks for a project', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/tasks/, body: taskListFixture }],
      () => runTool(getProjectTasksTool, { project_id: '5001' })
    );
    expect(result.content[0]?.text).toMatch(/Status: open/);
  });

  it('throws when project_id missing', async () => {
    await expect(runTool(getProjectTasksTool, {})).rejects.toThrow();
  });
});

describe('get_task', () => {
  it('renders task details with task_list resolved', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          body: singleTaskFixture,
        },
      ],
      () => runTool(getTaskTool, { task_id: '7001' })
    );
    expect(result.content[0]?.text).toMatch(/Title: Implement login form/);
    expect(result.content[0]?.text).toMatch(/Status: open/);
    expect(result.content[0]?.text).toMatch(/Task List: Sprint 1/);
  });

  it('throws on 404', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/missing/,
          status: 404,
          body: { errors: [{ detail: 'No such task' }] },
        },
      ],
      async () => {
        await expect(
          runTool(getTaskTool, { task_id: 'missing' })
        ).rejects.toThrow();
      }
    );
  });
});

describe('create_task', () => {
  it('creates a task and reports the result', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: '8001',
              type: 'tasks',
              attributes: {
                title: 'New thing',
                closed: false,
                description: 'desc',
                created_at: '2026-05-01T10:00:00Z',
              },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return createTaskTool(
          client,
          { title: 'New thing', description: 'desc', project_id: '5001' },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
      }
    );
    expect(result.content[0]?.text).toMatch(/Task created/);
    expect(result.content[0]?.text).toMatch(/Status: open/);
  });

  it('rejects when title missing', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    await expect(createTaskTool(client, {}, undefined)).rejects.toThrow();
  });
});

describe('update_task_assignment', () => {
  it('throws on 422 from the API', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          status: 422,
          body: { errors: [{ detail: 'Invalid assignee' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        await expect(
          updateTaskAssignmentTool(
            client,
            { task_id: '7001', assignee_id: '99' },
            { PRODUCTIVE_USER_ID: 'user-12' }
          )
        ).rejects.toThrow();
      }
    );
  });

  it('reports success on 200', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          body: {
            data: {
              id: '7001',
              type: 'tasks',
              attributes: { title: 'task' },
              relationships: { assignee: { data: { id: '99', type: 'people' } } },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return updateTaskAssignmentTool(
          client,
          { task_id: '7001', assignee_id: '99' },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/(updated|assigned|success)/);
  });
});

describe('update_task_details', () => {
  it('updates and renders the result', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          body: {
            data: {
              id: '7001',
              type: 'tasks',
              attributes: { title: 'Renamed', closed: false },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return updateTaskDetailsTool(client, {
          task_id: '7001',
          title: 'Renamed',
        });
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/(updated|renamed|success)/);
  });
});
