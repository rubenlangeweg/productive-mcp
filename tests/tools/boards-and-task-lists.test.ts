/**
 * Tests for the boards and task_lists tools. VAL-FOUNDATION-010, 011.
 */
import { describe, it, expect } from 'vitest';
import { listBoards, createBoard } from '../../src/tools/boards.js';
import {
  listTaskLists,
  createTaskList,
} from '../../src/tools/task-lists.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool } from '../helpers/runTool.js';

describe('list_boards', () => {
  it('renders boards list', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/boards/,
          body: {
            data: [
              {
                id: '301',
                type: 'boards',
                attributes: { name: 'Sprint board', description: 'Active' },
                relationships: { project: { data: { id: '5001', type: 'projects' } } },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listBoards, { project_id: '5001' })
    );
    expect(result.content[0]?.text).toMatch(/Sprint board/);
  });

  it('shows no-boards message on empty', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/boards/, body: { data: [], meta: { total_count: 0 } } }],
      () => runTool(listBoards, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no boards/);
  });

  it('throws on 401', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/boards/,
          status: 401,
          body: { errors: [{ detail: 'Bad token' }] },
        },
      ],
      async () => {
        await expect(runTool(listBoards, {})).rejects.toThrow();
      }
    );
  });
});

describe('create_board', () => {
  it('creates a board', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/boards/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: '305',
              type: 'boards',
              attributes: { name: 'New Board' },
              relationships: { project: { data: { id: '5001', type: 'projects' } } },
            },
          },
        },
      ],
      () =>
        runTool(createBoard, {
          name: 'New Board',
          project_id: '5001',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(new board|created|success)/
    );
  });

  it('throws when name missing', async () => {
    await expect(runTool(createBoard, { project_id: '5001' })).rejects.toThrow();
  });
});

describe('list_task_lists', () => {
  it('renders task lists', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_lists/,
          body: {
            data: [
              {
                id: '901',
                type: 'task_lists',
                attributes: { name: 'Backlog' },
                relationships: {
                  board: { data: { id: '301', type: 'boards' } },
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listTaskLists, { board_id: '301' })
    );
    expect(result.content[0]?.text).toMatch(/Backlog/);
  });

  it('shows empty result message', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_lists/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      () => runTool(listTaskLists, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no task[_ ]lists?/);
  });
});

describe('create_task_list', () => {
  it('creates a task list', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/task_lists/,
          method: 'POST',
          status: 201,
          body: {
            data: {
              id: '910',
              type: 'task_lists',
              attributes: { name: 'Sprint 5' },
              relationships: {
                board: { data: { id: '301', type: 'boards' } },
              },
            },
          },
        },
      ],
      () =>
        runTool(createTaskList, {
          name: 'Sprint 5',
          board_id: '301',
          project_id: '5001',
        })
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(sprint 5|created|success)/
    );
  });
});
