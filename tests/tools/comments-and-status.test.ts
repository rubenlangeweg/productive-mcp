import { describe, it, expect } from 'vitest';
import { addTaskCommentTool } from '../../src/tools/comments.js';
import {
  updateTaskStatusTool,
} from '../../src/tools/task-status.js';
import { listWorkflowStatusesTool } from '../../src/tools/workflow-statuses.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool } from '../helpers/runTool.js';

describe('add_task_comment', () => {
  it('creates a comment', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/comments/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: '4001',
              type: 'comments',
              attributes: { body: 'looks great' },
            },
          },
        },
      ],
      () => runTool(addTaskCommentTool, { task_id: '7001', comment: 'looks great' })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(comment|created|added|success)/
    );
  });

  it('rejects empty body', async () => {
    await expect(
      runTool(addTaskCommentTool, { task_id: '7001', comment: '' })
    ).rejects.toThrow();
  });
});

describe('update_task_status', () => {
  it('updates status (via PATCH)', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          body: {
            data: {
              id: '7001',
              type: 'tasks',
              attributes: { closed: true },
            },
          },
        },
      ],
      () => runTool(updateTaskStatusTool, { task_id: '7001', workflow_status_id: '75' })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(status|updated|success)/
    );
  });

  it('throws on 422', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/tasks\/7001/,
          method: 'PATCH',
          status: 422,
          body: { errors: [{ detail: 'Bad transition' }] },
        },
      ],
      async () => {
        await expect(
          runTool(updateTaskStatusTool, {
            task_id: '7001',
            workflow_status_id: '99',
          })
        ).rejects.toThrow();
      }
    );
  });
});

describe('list_workflow_statuses', () => {
  it('renders workflow statuses', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/workflow_statuses/,
          body: {
            data: [
              {
                id: '75',
                type: 'workflow_statuses',
                attributes: {
                  name: 'In progress',
                  category_id: 2,
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listWorkflowStatusesTool, {})
    );
    expect(result.content[0]?.text).toMatch(/In progress/);
  });

  it('shows empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/workflow_statuses/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      () => runTool(listWorkflowStatusesTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(no workflow|no status)/
    );
  });
});
