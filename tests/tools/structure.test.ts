/**
 * Smaller helper-test bundle covering memberships, bookings, todos, deps,
 * pages, attachments, subtasks, my-tasks, activities, recent-updates.
 */
import { describe, it, expect } from 'vitest';
import { listMembershipsTool } from '../../src/tools/memberships.js';
import { listBookingsTool } from '../../src/tools/bookings.js';
import {
  listTodosTool,
  createTodoTool,
  updateTodoTool,
  deleteTodoTool,
} from '../../src/tools/todos.js';
import {
  listTaskDependenciesTool,
  addTaskDependencyTool,
  removeTaskDependencyTool,
} from '../../src/tools/dependencies.js';
import { listPagesTool, getPageTool } from '../../src/tools/pages.js';
import { listAttachmentsTool } from '../../src/tools/attachments.js';
import { listSubtasksTool } from '../../src/tools/subtasks.js';
import { myTasksTool } from '../../src/tools/my-tasks.js';
import { listActivities } from '../../src/tools/activities.js';
import { getRecentUpdates } from '../../src/tools/recent-updates.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool, TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

describe('list_memberships', () => {
  it('renders memberships', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/memberships/,
          body: {
            data: [
              {
                id: '1',
                type: 'memberships',
                attributes: { role: 'manager' },
                relationships: {
                  person: { data: { id: '12', type: 'people' } },
                  project: { data: { id: '5001', type: 'projects' } },
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listMembershipsTool, {})
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });

  it('shows empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/memberships/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      () => runTool(listMembershipsTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no member/);
  });
});

describe('list_bookings', () => {
  it('renders bookings', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/bookings/,
          body: {
            data: [
              {
                id: 'b1',
                type: 'bookings',
                attributes: {
                  started_on: '2026-05-01',
                  ended_on: '2026-05-07',
                  time: 480,
                  booked_time: 2400,
                  note: 'sprint allocation',
                },
                relationships: {
                  person: { data: { id: '12', type: 'people' } },
                  project: { data: { id: '5001', type: 'projects' } },
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listBookingsTool(
          client,
          { after: '2026-05-01', before: '2026-05-31' },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
      }
    );
    expect(result.content[0]?.text).toMatch(/2026-05-01/);
  });

  it('shows empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/bookings/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listBookingsTool(client, {}, undefined);
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no booking/);
  });
});

describe('todos CRUD', () => {
  it('list_todos renders', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/todos/,
          body: {
            data: [
              {
                id: 't1',
                type: 'todos',
                attributes: { title: 'Step 1', completed: false },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listTodosTool, { task_id: '7001' })
    );
    expect(result.content[0]?.text).toMatch(/Step 1/);
  });

  it('create_todo', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/todos/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: 't2',
              type: 'todos',
              attributes: { title: 'Do thing', completed: false },
            },
          },
        },
      ],
      () =>
        runTool(createTodoTool, {
          task_id: '7001',
          title: 'Do thing',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(do thing|created|added|success)/
    );
  });

  it('update_todo throws on 422', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/todos\/t1/,
          method: 'PATCH',
          status: 422,
          body: { errors: [{ detail: 'Bad title' }] },
        },
      ],
      async () => {
        await expect(
          runTool(updateTodoTool, { todo_id: 't1', title: 'x' })
        ).rejects.toThrow();
      }
    );
  });

  it('delete_todo on 204', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/todos\/t1/,
          method: 'DELETE',
          status: 204,
          body: '',
        },
      ],
      () => runTool(deleteTodoTool, { todo_id: 't1' })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(deleted|removed|success)/
    );
  });
});

describe('task dependencies', () => {
  it('list_task_dependencies renders', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_dependencies/,
          body: {
            data: [
              {
                id: 'd1',
                type: 'task_dependencies',
                attributes: { dependency_type: 'finish_to_start' },
                relationships: {
                  task: { data: { id: '7001', type: 'tasks' } },
                  depends_on: { data: { id: '7002', type: 'tasks' } },
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listTaskDependenciesTool, { task_id: '7001' })
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });

  it('add_task_dependency', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_dependencies/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: 'd2',
              type: 'task_dependencies',
              attributes: { dependency_type: 'finish_to_start' },
            },
          },
        },
      ],
      () =>
        runTool(addTaskDependencyTool, {
          task_id: '7001',
          depends_on_task_id: '7002',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(added|created|success)/
    );
  });

  it('remove_task_dependency on 204', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_dependencies\/d1/,
          method: 'DELETE',
          status: 204,
          body: '',
        },
      ],
      () => runTool(removeTaskDependencyTool, { dependency_id: 'd1' })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(removed|deleted|success)/
    );
  });
});

describe('pages', () => {
  it('list_pages renders', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/pages/,
          body: {
            data: [
              {
                id: 'p1',
                type: 'pages',
                attributes: { title: 'Architecture overview' },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listPagesTool, {})
    );
    expect(result.content[0]?.text).toMatch(/Architecture/);
  });

  it('get_page', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/pages\/p1/,
          body: {
            data: {
              id: 'p1',
              type: 'pages',
              attributes: { title: 'Page Title', body: 'content' },
            },
          },
        },
      ],
      () => runTool(getPageTool, { page_id: 'p1' })
    );
    expect(result.content[0]?.text).toMatch(/Page Title/);
  });
});

describe('list_attachments', () => {
  it('lists for a task', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/attachments/,
          body: {
            data: [
              {
                id: 'a1',
                type: 'attachments',
                attributes: {
                  name: 'spec.pdf',
                  file_name: 'spec.pdf',
                  attachment_file_name: 'spec.pdf',
                  file_size: 1234,
                  size: 1234,
                  content_type: 'application/pdf',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listAttachmentsTool, { task_id: '7001' })
    );
    // Tool renders an attachment block; just ensure it has some non-empty
    // output and the ID is present (the precise field set varies).
    expect(result.content[0]?.text).toMatch(/a1/);
  });
});

describe('list_subtasks', () => {
  it('renders subtasks of a parent task', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          body: {
            data: [
              {
                id: 'st1',
                type: 'tasks',
                attributes: { title: 'Subtask', closed: false },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listSubtasksTool, { parent_task_id: '7001' })
    );
    expect(result.content[0]?.text).toMatch(/Subtask/);
  });
});

describe('my_tasks', () => {
  it('renders my tasks for a configured user', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          body: {
            data: [
              {
                id: 'mt1',
                type: 'tasks',
                attributes: { title: 'My todo', closed: false },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return myTasksTool(client, TEST_CONFIG, {});
      }
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });

  it('reports no-config when user is not set', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    const result = await myTasksTool(
      client,
      { ...TEST_CONFIG, PRODUCTIVE_USER_ID: undefined },
      {}
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(not configured|productive_user_id|no user)/
    );
  });
});

describe('list_activities & recent_updates', () => {
  it('list_activities renders', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/activities/,
          body: {
            data: [
              {
                id: 'ac1',
                type: 'activities',
                attributes: {
                  event: 'task.create',
                  created_at: '2026-04-30T10:00:00Z',
                  item_type: 'task',
                  item_id: '7001',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listActivities, {})
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });

  it('recent_updates renders', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/activities/,
          body: {
            data: [
              {
                id: 'ac1',
                type: 'activities',
                attributes: {
                  event: 'task.update',
                  created_at: '2026-04-30T10:00:00Z',
                  item_type: 'task',
                  item_id: '7001',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(getRecentUpdates, {})
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });
});
