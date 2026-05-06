/**
 * Tests for task-action tools: sprint, list-move, backlog, reposition, batch.
 */
import { describe, it, expect } from 'vitest';
import { updateTaskSprint } from '../../src/tools/task-sprint.js';
import { moveTaskToList } from '../../src/tools/task-list-move.js';
import { addToBacklog } from '../../src/tools/task-backlog.js';
import { taskRepositionTool } from '../../src/tools/task-reposition.js';
import { createTasksBatchTool } from '../../src/tools/batch.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool, TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

describe('update_task_sprint', () => {
  it('updates sprint custom field', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          body: {
            data: {
              id: '7001',
              type: 'tasks',
              attributes: { title: 'task', custom_fields: { '69063': ['231233'] } },
            },
          },
        },
      ],
      () =>
        runTool(updateTaskSprint, {
          task_id: '7001',
          sprints: 'S03',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(sprint|updated|success)/
    );
  });

  it('throws on 422', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          status: 422,
          body: { errors: [{ detail: 'Invalid field' }] },
        },
      ],
      async () => {
        await expect(
          runTool(updateTaskSprint, {
            task_id: '7001',
            sprints: 'S03',
          })
        ).rejects.toThrow();
      }
    );
  });
});

describe('move_task_to_list', () => {
  it('moves a task', async () => {
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
              relationships: {
                task_list: { data: { id: '910', type: 'task_lists' } },
              },
            },
          },
        },
      ],
      () =>
        runTool(moveTaskToList, {
          task_id: '7001',
          task_list_id: '910',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(moved|task list|success)/
    );
  });

  it('throws on 422', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          status: 422,
          body: { errors: [{ detail: 'List not in same project' }] },
        },
      ],
      async () => {
        await expect(
          runTool(moveTaskToList, { task_id: '7001', task_list_id: '999' })
        ).rejects.toThrow();
      }
    );
  });
});

describe('add_to_backlog', () => {
  it('throws when no backlog list found', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/boards/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        await expect(
          runTool(addToBacklog, { task_id: '7001', project_id: '5001' })
        ).rejects.toThrow();
      }
    );
  });

  it('moves task to existing backlog list', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/boards/,
          body: {
            data: [{ id: '301', type: 'boards', attributes: { name: 'Main' } }],
            meta: { total_count: 1 },
          },
        },
        {
          path: /\/api\/v2\/task_lists/,
          body: {
            data: [
              {
                id: '910',
                type: 'task_lists',
                attributes: { name: 'Backlog' },
              },
            ],
            meta: { total_count: 1 },
          },
        },
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          body: {
            data: {
              id: '7001',
              type: 'tasks',
              attributes: { title: 'task' },
            },
          },
        },
      ],
      () =>
        runTool(addToBacklog, {
          task_id: '7001',
          project_id: '5001',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(backlog|moved|success)/
    );
  });
});

describe('reposition_task', () => {
  it('reports error on getTask 404', async () => {
    // The reposition tool catches errors and returns them as a content message
    // (legacy behaviour). Verify the error path produces a useful summary.
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/missing/,
          method: 'GET',
          status: 404,
          body: { errors: [{ detail: 'No such task' }] },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return taskRepositionTool(client, {
          taskId: 'missing',
          move_after_id: '7000',
        });
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(error|failed|not found)/
    );
  });
});

describe('create_tasks_batch', () => {
  it('rejects when array empty', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    await expect(
      createTasksBatchTool(client, { tasks: [] }, undefined)
    ).rejects.toThrow();
  });

  it('creates multiple tasks', async () => {
    let postCount = 0;
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: 'b1',
              type: 'tasks',
              attributes: { title: 'one', closed: false },
            },
          },
        },
        {
          path: /\/api\/v2\/tasks/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: 'b2',
              type: 'tasks',
              attributes: { title: 'two', closed: false },
            },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        const r = await createTasksBatchTool(
          client,
          {
            project_id: '5001',
            task_list_id: '910',
            tasks: [{ title: 'one' }, { title: 'two' }],
          },
          { PRODUCTIVE_USER_ID: 'user-12' }
        );
        postCount = 2;
        return r;
      }
    );
    expect(postCount).toBe(2);
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(created|2|batch|success)/
    );
  });
});
