/**
 * Branch-coverage filler for the per-resource modules. The integration tests
 * in tests/tools/* cover the happy paths; this file walks each branch in the
 * resource helpers via the standalone exports + a fake Requester so the
 * branch threshold (75%) holds.
 */
import { describe, it, expect, vi } from 'vitest';
import * as activities from '../../src/api/resources/activities.js';
import * as attachments from '../../src/api/resources/attachments.js';
import * as boards from '../../src/api/resources/boards.js';
import * as bookings from '../../src/api/resources/bookings.js';
import * as comments from '../../src/api/resources/comments.js';
import * as companies from '../../src/api/resources/companies.js';
import * as deals from '../../src/api/resources/deals.js';
import * as dependencies from '../../src/api/resources/dependencies.js';
import * as expenses from '../../src/api/resources/expenses.js';
import * as invoices from '../../src/api/resources/invoices.js';
import * as memberships from '../../src/api/resources/memberships.js';
import * as pages from '../../src/api/resources/pages.js';
import * as people from '../../src/api/resources/people.js';
import * as projects from '../../src/api/resources/projects.js';
import * as services from '../../src/api/resources/services.js';
import * as taskActions from '../../src/api/resources/task-actions.js';
import * as taskLists from '../../src/api/resources/task-lists.js';
import * as tasks from '../../src/api/resources/tasks.js';
import * as timeEntries from '../../src/api/resources/time-entries.js';
import * as todos from '../../src/api/resources/todos.js';
import * as workflowStatuses from '../../src/api/resources/workflow-statuses.js';
import type { Requester } from '../../src/api/resources/_requester.js';

/**
 * Build a fake Requester that records the path each call hit and returns a
 * canned response. Tests assert paths to verify branch construction (filters,
 * pagination, encoding) without involving fetch.
 */
function recorder<T = unknown>(response: T = {} as T) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fn: Requester = vi.fn((async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return response;
  }) as unknown as Requester);
  return { fn, calls };
}

describe('resource module branch coverage', () => {
  it('listCompanies builds path with status + pagination', async () => {
    const r = recorder({ data: [] });
    await companies.listCompanies(r.fn, {
      status: 'archived',
      limit: 50,
      page: 2,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bstatus%5D=archived/);
    expect(r.calls[0]?.path).toMatch(/page%5Bsize%5D=50/);
    expect(r.calls[0]?.path).toMatch(/page%5Bnumber%5D=2/);
  });

  it('listProjects translates status to integer', async () => {
    const r = recorder({ data: [] });
    await projects.listProjects(r.fn, { status: 'active', company_id: '1' });
    expect(r.calls[0]?.path).toMatch(/filter%5Bstatus%5D=1/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bcompany_id%5D=1/);

    const r2 = recorder({ data: [] });
    await projects.listProjects(r2.fn, { status: 'archived' });
    expect(r2.calls[0]?.path).toMatch(/filter%5Bstatus%5D=2/);
  });

  it('listTasks translates status open/closed to integer', async () => {
    const r = recorder({ data: [] });
    await tasks.listTasks(r.fn, { status: 'closed', assignee_id: '12' });
    expect(r.calls[0]?.path).toMatch(/filter%5Bstatus%5D=2/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bassignee_id%5D=12/);
  });

  it('getTask supports include parameter', async () => {
    const r = recorder({ data: { id: '1', type: 'tasks' } });
    await tasks.getTask(r.fn, '1', { include: 'task_list' });
    expect(r.calls[0]?.path).toBe('tasks/1?include=task_list');

    const r2 = recorder({ data: { id: '1', type: 'tasks' } });
    await tasks.getTask(r2.fn, '1');
    expect(r2.calls[0]?.path).toBe('tasks/1');
  });

  it('createTask + updateTask use POST/PATCH', async () => {
    const r = recorder({ data: {} });
    await tasks.createTask(r.fn, {
      data: { type: 'tasks', attributes: { title: 'x' } },
    });
    expect(r.calls[0]?.init?.method).toBe('POST');

    const r2 = recorder({ data: {} });
    await tasks.updateTask(r2.fn, '1', {
      data: { type: 'tasks', id: '1', attributes: { title: 'x' } },
    });
    expect(r2.calls[0]?.init?.method).toBe('PATCH');
  });

  it('listSubtasks filters by parent_task_id', async () => {
    const r = recorder({ data: [] });
    await tasks.listSubtasks(r.fn, '7001', { limit: 50 });
    expect(r.calls[0]?.path).toMatch(/filter%5Bparent_task_id%5D=7001/);
  });

  it('boards: list + create', async () => {
    const r = recorder({ data: [] });
    await boards.listBoards(r.fn, { project_id: '5001', limit: 10 });
    expect(r.calls[0]?.path).toMatch(/filter%5Bproject_id%5D=5001/);

    const r2 = recorder({ data: {} });
    await boards.createBoard(r2.fn, {
      data: { type: 'boards', attributes: { name: 'New' } },
    });
    expect(r2.calls[0]?.init?.method).toBe('POST');
  });

  it('task lists: list + create with filters', async () => {
    const r = recorder({ data: [] });
    await taskLists.listTaskLists(r.fn, { board_id: '301' });
    expect(r.calls[0]?.path).toMatch(/filter%5Bboard_id%5D=301/);

    const r2 = recorder({ data: {} });
    await taskLists.createTaskList(r2.fn, {
      data: { type: 'task_lists', attributes: { name: 'x' } },
    });
    expect(r2.calls[0]?.init?.method).toBe('POST');
  });

  it('people: list with all filters + getPerson', async () => {
    const r = recorder({ data: [] });
    await people.listPeople(r.fn, {
      company_id: '1',
      project_id: '5',
      is_active: false,
      email: 'x@y',
      limit: 10,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bis_active%5D=false/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bemail%5D=x%40y/);

    const r2 = recorder({ data: {} });
    await people.getPerson(r2.fn, '12');
    expect(r2.calls[0]?.path).toBe('people/12');
  });

  it('activities: list with all filter branches', async () => {
    const r = recorder({ data: [] });
    await activities.listActivities(r.fn, {
      task_id: '1',
      project_id: '2',
      person_id: '3',
      item_type: 'task',
      event: 'create',
      after: '2026-01-01',
      before: '2026-12-31',
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Btask_id%5D=1/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bproject_id%5D=2/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bperson_id%5D=3/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bitem_type%5D=task/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bevent%5D=create/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bafter%5D=2026-01-01/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bbefore%5D=2026-12-31/);
  });

  it('comments createComment uses POST', async () => {
    const r = recorder({ data: {} });
    await comments.createComment(r.fn, {
      data: { type: 'comments', attributes: { body: 'hi' } },
    });
    expect(r.calls[0]?.init?.method).toBe('POST');
  });

  it('workflow statuses: list with category_id branch', async () => {
    const r = recorder({ data: [] });
    await workflowStatuses.listWorkflowStatuses(r.fn, {
      workflow_id: '1',
      category_id: 2,
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bcategory_id%5D=2/);
  });

  it('time entries: all CRUD methods', async () => {
    const r = recorder({ data: [] });
    await timeEntries.listTimeEntries(r.fn, {
      date: '2026-01-01',
      after: '2026-01-01',
      before: '2026-12-31',
      person_id: '12',
      project_id: '5001',
      task_id: '7001',
      service_id: '500',
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/include=person%2Cservice%2Ctask/);

    const r2 = recorder({ data: {} });
    await timeEntries.getTimeEntry(r2.fn, '1');
    expect(r2.calls[0]?.path).toBe('time_entries/1');

    const r3 = recorder({ data: {} });
    await timeEntries.createTimeEntry(r3.fn, {
      data: {
        type: 'time_entries',
        attributes: { date: '2026-01-01', time: 60 },
      },
    });
    expect(r3.calls[0]?.init?.method).toBe('POST');

    const r4 = recorder({ data: {} });
    await timeEntries.updateTimeEntry(r4.fn, '1', {
      data: {
        type: 'time_entries',
        id: '1',
        attributes: { time: 30 },
      },
    });
    expect(r4.calls[0]?.init?.method).toBe('PATCH');

    const r5 = recorder(undefined);
    await timeEntries.deleteTimeEntry(r5.fn, '1');
    expect(r5.calls[0]?.init?.method).toBe('DELETE');
  });

  it('deals: listProjectDeals with budget_type + listDealsAllPages', async () => {
    const r = recorder({ data: [] });
    await deals.listProjectDeals(r.fn, {
      project_id: '5001',
      budget_type: 1,
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bbudget_type%5D=1/);

    let pageCalls = 0;
    const fn: Requester = vi.fn(async (_path: string) => {
      pageCalls += 1;
      return {
        data: pageCalls === 1 ? [{ id: '1' }, { id: '2' }] : [],
        meta: { total_count: 2 },
      } as unknown;
    }) as unknown as Requester;
    const r2 = await deals.listDealsAllPages(fn, {});
    expect(r2).toHaveLength(2);
  });

  it('services: listServices, listDealServices, listServicesForDealAllPages', async () => {
    const r = recorder({ data: [] });
    await services.listServices(r.fn, { company_id: '1', limit: 1, page: 1 });
    expect(r.calls[0]?.path).toMatch(/filter%5Bcompany_id%5D=1/);

    const r2 = recorder({ data: [] });
    await services.listDealServices(r2.fn, { deal_id: '900' });
    expect(r2.calls[0]?.path).toMatch(/filter%5Bdeal_id%5D=900/);

    let pages = 0;
    const fn: Requester = vi.fn(async () => {
      pages += 1;
      return {
        data: pages === 1 ? [{ id: 's1' }] : [],
        meta: { total_count: 1 },
      } as unknown;
    }) as unknown as Requester;
    const r3 = await services.listServicesForDealAllPages(fn, '900');
    expect(r3).toHaveLength(1);
  });

  it('invoices: listInvoices status branch + getInvoice', async () => {
    const r = recorder({ data: [] });
    await invoices.listInvoices(r.fn, {
      company_id: '1',
      project_id: '2',
      status: 1,
      after: '2026-01-01',
      before: '2026-12-31',
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bstatus%5D=1/);

    const r2 = recorder({ data: {} });
    await invoices.getInvoice(r2.fn, '7');
    expect(r2.calls[0]?.path).toBe('invoices/7');
  });

  it('expenses: list + create', async () => {
    const r = recorder({ data: [] });
    await expenses.listExpenses(r.fn, {
      person_id: '12',
      project_id: '5',
      after: '2026-01-01',
      before: '2026-12-31',
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bperson_id%5D=12/);

    const r2 = recorder({ data: {} });
    await expenses.createExpense(r2.fn, {
      data: { type: 'expenses', attributes: { name: 'x', amount: 1 } },
    });
    expect(r2.calls[0]?.init?.method).toBe('POST');
  });

  it('memberships: list with all filters', async () => {
    const r = recorder({ data: [] });
    await memberships.listMemberships(r.fn, {
      project_id: '5001',
      person_id: '12',
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bproject_id%5D=5001/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bperson_id%5D=12/);
  });

  it('bookings: listBookings translates after/before', async () => {
    const r = recorder({ data: [] });
    await bookings.listBookings(r.fn, {
      person_id: '12',
      project_id: '5001',
      after: '2026-05-01',
      before: '2026-05-31',
      limit: 5,
      page: 1,
    });
    expect(r.calls[0]?.path).toMatch(/filter%5Bstarted_on_after%5D=2026-05-01/);
    expect(r.calls[0]?.path).toMatch(/filter%5Bstarted_on_before%5D=2026-05-31/);

    let pages = 0;
    const fn: Requester = vi.fn(async () => {
      pages += 1;
      return {
        data: pages === 1 ? [{ id: 'b1', type: 'bookings' }] : [],
        included: pages === 1
          ? [{ id: 'p1', type: 'people' }]
          : undefined,
        meta: { total_count: 1 },
      } as unknown;
    }) as unknown as Requester;
    const result = await bookings.listBookingsWithIncludedAllPages(fn, {
      after: '2026-05-01',
      before: '2026-05-31',
      person_id: '12',
    });
    expect(result.bookings).toHaveLength(1);
    expect(result.included).toHaveLength(1);
  });

  it('todos: full CRUD', async () => {
    const r = recorder({ data: [] });
    await todos.listTodos(r.fn, '7001');
    // todos.listTodos uses raw template-string filter (not URLSearchParams).
    expect(r.calls[0]?.path).toMatch(/filter\[task_id\]=7001/);

    const r2 = recorder({ data: {} });
    await todos.createTodo(r2.fn, {
      data: { type: 'todos', attributes: { title: 'x' } },
    });
    expect(r2.calls[0]?.init?.method).toBe('POST');

    const r3 = recorder({ data: {} });
    await todos.updateTodo(r3.fn, '1', { title: 'x', completed: true });
    expect(r3.calls[0]?.init?.method).toBe('PATCH');

    const r4 = recorder(undefined);
    await todos.deleteTodo(r4.fn, '1');
    expect(r4.calls[0]?.init?.method).toBe('DELETE');
  });

  it('dependencies: full CRUD', async () => {
    const r = recorder({ data: [] });
    await dependencies.listTaskDependencies(r.fn, '7001');
    // dependencies.listTaskDependencies uses raw template-string filter.
    expect(r.calls[0]?.path).toMatch(/filter\[task_id\]=7001/);

    const r2 = recorder({ data: {} });
    await dependencies.addTaskDependency(r2.fn, {
      data: {
        type: 'task_dependencies',
        attributes: {},
        relationships: {
          task: { data: { id: '7001', type: 'tasks' } },
          depends_on: { data: { id: '7002', type: 'tasks' } },
        },
      },
    });
    expect(r2.calls[0]?.init?.method).toBe('POST');

    const r3 = recorder(undefined);
    await dependencies.removeTaskDependency(r3.fn, '1');
    expect(r3.calls[0]?.init?.method).toBe('DELETE');
  });

  it('pages: list + get', async () => {
    const r = recorder({ data: [] });
    await pages.listPages(r.fn, { project_id: '5001', limit: 5, page: 1 });
    expect(r.calls[0]?.path).toMatch(/filter%5Bproject_id%5D=5001/);

    const r2 = recorder({ data: {} });
    await pages.getPage(r2.fn, 'p1');
    expect(r2.calls[0]?.path).toBe('pages/p1');
  });

  it('attachments: by task / by comment / by neither', async () => {
    const r = recorder({ data: [] });
    await attachments.listAttachments(r.fn, { task_id: '7001', limit: 5 });
    expect(r.calls[0]?.path).toMatch(/filter%5Battachable_type%5D=Task/);

    const r2 = recorder({ data: [] });
    await attachments.listAttachments(r2.fn, { comment_id: 'c1' });
    expect(r2.calls[0]?.path).toMatch(/filter%5Battachable_type%5D=Comment/);

    const r3 = recorder({ data: [] });
    await attachments.listAttachments(r3.fn, {});
    expect(r3.calls[0]?.path).toBe('attachments?');
  });

  it('task-actions: repositionTask returns success summary', async () => {
    const r = recorder({});
    const out = await taskActions.repositionTask(r.fn, '7001', {
      move_after_id: '7000',
    });
    expect(r.calls[0]?.init?.method).toBe('PATCH');
    expect(out).toEqual({
      success: true,
      taskId: '7001',
      message: 'Task 7001 repositioned successfully',
    });
  });
});
