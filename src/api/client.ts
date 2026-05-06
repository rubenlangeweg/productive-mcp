/**
 * `ProductiveAPIClient` — backwards-compatible facade over the per-resource
 * modules in `src/api/resources/*`.
 *
 * Every existing tool calls `client.<method>(...)`. Rather than touch every
 * tool file in M1, the methods here are thin delegates that pass the
 * client's `makeRequest` Requester into the matching per-resource function.
 *
 * The actual request logic (header injection, error mapping, retries) lives
 * in `makeRequest` for now and will move to `src/api/core.ts` in M2.
 */
import { Config } from '../config/index.js';
import {
  ProductiveAttachment,
  ProductiveBoard,
  ProductiveBoardCreate,
  ProductiveBooking,
  ProductiveCompany,
  ProductiveDependency,
  ProductiveDependencyCreate,
  ProductiveError,
  ProductiveExpense,
  ProductiveExpenseCreate,
  ProductiveFolder,
  ProductiveFolderCreate,
  ProductiveInvoice,
  ProductiveMembership,
  ProductivePage,
  ProductivePerson,
  ProductiveProject,
  ProductiveResponse,
  ProductiveService,
  ProductiveSingleResponse,
  ProductiveTask,
  ProductiveTaskCreate,
  ProductiveTaskList,
  ProductiveTaskListCreate,
  ProductiveTaskUpdate,
  ProductiveTimeEntry,
  ProductiveTimeEntryCreate,
  ProductiveTimeEntryUpdate,
  ProductiveTodo,
  ProductiveTodoCreate,
  ProductiveDeal,
  ProductiveActivity,
  ProductiveComment,
  ProductiveCommentCreate,
  ProductiveWorkflowStatus,
} from './types.js';

import * as activities from './resources/activities.js';
import * as attachments from './resources/attachments.js';
import * as boards from './resources/boards.js';
import * as bookings from './resources/bookings.js';
import * as comments from './resources/comments.js';
import * as companies from './resources/companies.js';
import * as deals from './resources/deals.js';
import * as dependencies from './resources/dependencies.js';
import * as expenses from './resources/expenses.js';
import * as folders from './resources/folders.js';
import * as invoices from './resources/invoices.js';
import * as memberships from './resources/memberships.js';
import * as pages from './resources/pages.js';
import * as people from './resources/people.js';
import * as projects from './resources/projects.js';
import * as services from './resources/services.js';
import * as taskActions from './resources/task-actions.js';
import * as taskLists from './resources/task-lists.js';
import * as tasks from './resources/tasks.js';
import * as timeEntries from './resources/time-entries.js';
import * as todos from './resources/todos.js';
import * as workflowStatuses from './resources/workflow-statuses.js';
import { getAllPages as legacyGetAllPages } from './resources/_pagination-legacy.js';
import type { Requester } from './resources/_requester.js';

export class ProductiveAPIClient {
  private config: Config;
  /** Bound requester passed into each per-resource function. */
  private readonly request: Requester;

  constructor(config: Config) {
    this.config = config;
    this.request = this.makeRequest.bind(this) as Requester;
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-Auth-Token': this.config.PRODUCTIVE_API_TOKEN,
      'X-Organization-Id': this.config.PRODUCTIVE_ORG_ID,
      'Content-Type': 'application/vnd.api+json',
    };
  }

  private async makeRequest<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.config.PRODUCTIVE_API_BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options?.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      // Special-case 204 No Content for DELETE operations
      if (response.status === 204) {
        return undefined as T;
      }
      throw new Error(await this.buildErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async buildErrorMessage(response: Response): Promise<string> {
    let apiDetail = '';
    try {
      const errorData = (await response.json()) as ProductiveError;
      apiDetail =
        errorData.errors?.[0]?.detail ??
        errorData.errors?.[0]?.title ??
        '';
    } catch {
      // body was not JSON
    }
    switch (response.status) {
      case 401:
        return `Authentication failed${apiDetail ? `: ${apiDetail}` : '. Check your PRODUCTIVE_API_TOKEN.'}`;
      case 403:
        return `Permission denied${apiDetail ? `: ${apiDetail}` : '. Your Productive.io account does not have access to this resource.'}`;
      case 404:
        return `Not found${apiDetail ? `: ${apiDetail}` : '. The requested resource does not exist.'}`;
      case 422:
        return `Invalid request${apiDetail ? `: ${apiDetail}` : '. Check the provided parameters.'}`;
      default:
        return apiDetail || `API request failed with status ${response.status}`;
    }
  }

  // ─── Companies ─────────────────────────────────────────────────────────────
  listCompanies(
    params?: companies.ListCompaniesParams
  ): Promise<ProductiveResponse<ProductiveCompany>> {
    return companies.listCompanies(this.request, params);
  }

  // ─── Projects ──────────────────────────────────────────────────────────────
  listProjects(
    params?: projects.ListProjectsParams
  ): Promise<ProductiveResponse<ProductiveProject>> {
    return projects.listProjects(this.request, params);
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  listTasks(
    params?: tasks.ListTasksParams
  ): Promise<ProductiveResponse<ProductiveTask>> {
    return tasks.listTasks(this.request, params);
  }
  getTask(
    taskId: string,
    options?: { include?: string }
  ): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return tasks.getTask(this.request, taskId, options);
  }
  createTask(
    taskData: ProductiveTaskCreate
  ): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return tasks.createTask(this.request, taskData);
  }
  updateTask(
    taskId: string,
    taskData: ProductiveTaskUpdate
  ): Promise<ProductiveSingleResponse<ProductiveTask>> {
    return tasks.updateTask(this.request, taskId, taskData);
  }
  listSubtasks(
    parentTaskId: string,
    params?: { limit?: number }
  ): Promise<ProductiveResponse<ProductiveTask>> {
    return tasks.listSubtasks(this.request, parentTaskId, params);
  }
  deleteTask(taskId: string): Promise<void> {
    return tasks.deleteTask(this.request, taskId);
  }
  repositionTask(
    taskId: string,
    attributes: {
      move_before_id?: string;
      move_after_id?: string;
      placement?: number;
    }
  ): Promise<{ success: boolean; taskId: string; message: string }> {
    return taskActions.repositionTask(this.request, taskId, attributes);
  }

  // ─── Boards ────────────────────────────────────────────────────────────────
  listBoards(
    params?: boards.ListBoardsParams
  ): Promise<ProductiveResponse<ProductiveBoard>> {
    return boards.listBoards(this.request, params);
  }
  createBoard(
    boardData: ProductiveBoardCreate
  ): Promise<ProductiveSingleResponse<ProductiveBoard>> {
    return boards.createBoard(this.request, boardData);
  }

  // ─── Task lists ────────────────────────────────────────────────────────────
  listTaskLists(
    params?: taskLists.ListTaskListsParams
  ): Promise<ProductiveResponse<ProductiveTaskList>> {
    return taskLists.listTaskLists(this.request, params);
  }
  getTaskList(
    taskListId: string
  ): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return taskLists.getTaskList(this.request, taskListId);
  }
  createTaskList(
    data: ProductiveTaskListCreate
  ): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return taskLists.createTaskList(this.request, data);
  }
  updateTaskList(
    taskListId: string,
    attrs: { name: string }
  ): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return taskLists.updateTaskList(this.request, taskListId, attrs);
  }
  archiveTaskList(taskListId: string): Promise<void> {
    return taskLists.archiveTaskList(this.request, taskListId);
  }
  restoreTaskList(
    taskListId: string
  ): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return taskLists.restoreTaskList(this.request, taskListId);
  }
  repositionTaskList(
    taskListId: string,
    attrs: { move_before_id?: string }
  ): Promise<ProductiveSingleResponse<ProductiveTaskList>> {
    return taskLists.repositionTaskList(this.request, taskListId, attrs);
  }

  // ─── People ────────────────────────────────────────────────────────────────
  listPeople(
    params?: people.ListPeopleParams
  ): Promise<ProductiveResponse<ProductivePerson>> {
    return people.listPeople(this.request, params);
  }
  getPerson(
    personId: string
  ): Promise<ProductiveSingleResponse<ProductivePerson>> {
    return people.getPerson(this.request, personId);
  }
  /** rb2: full org-wide people list (legacy untyped). */
  listAllPeople(): Promise<unknown[]> {
    return legacyGetAllPages<unknown>(
      this.request,
      'people',
      new URLSearchParams()
    );
  }

  // ─── Activities ────────────────────────────────────────────────────────────
  listActivities(
    params?: activities.ListActivitiesParams
  ): Promise<ProductiveResponse<ProductiveActivity>> {
    return activities.listActivities(this.request, params);
  }

  // ─── Comments ──────────────────────────────────────────────────────────────
  listComments(
    params: comments.ListCommentsParams
  ): Promise<ProductiveResponse<ProductiveComment>> {
    return comments.listComments(this.request, params);
  }
  getComment(
    commentId: string
  ): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return comments.getComment(this.request, commentId);
  }
  createComment(
    data: ProductiveCommentCreate
  ): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return comments.createComment(this.request, data);
  }
  updateComment(
    commentId: string,
    attrs: { body?: string; pinned?: boolean }
  ): Promise<ProductiveSingleResponse<ProductiveComment>> {
    return comments.updateComment(this.request, commentId, attrs);
  }
  deleteComment(commentId: string): Promise<void> {
    return comments.deleteComment(this.request, commentId);
  }
  addCommentReaction(
    commentId: string,
    reaction: string
  ): Promise<ProductiveSingleResponse<{ id: string; type: string; attributes: Record<string, unknown> }>> {
    return comments.addCommentReaction(this.request, commentId, reaction);
  }

  // ─── Workflow statuses ─────────────────────────────────────────────────────
  listWorkflowStatuses(
    params?: workflowStatuses.ListWorkflowStatusesParams
  ): Promise<ProductiveResponse<ProductiveWorkflowStatus>> {
    return workflowStatuses.listWorkflowStatuses(this.request, params);
  }

  // ─── Time entries ──────────────────────────────────────────────────────────
  listTimeEntries(
    params?: timeEntries.ListTimeEntriesParams
  ): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    return timeEntries.listTimeEntries(this.request, params);
  }
  getTimeEntry(
    id: string
  ): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
    return timeEntries.getTimeEntry(this.request, id);
  }
  createTimeEntry(
    data: ProductiveTimeEntryCreate
  ): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
    return timeEntries.createTimeEntry(this.request, data);
  }
  updateTimeEntry(
    id: string,
    data: ProductiveTimeEntryUpdate
  ): Promise<ProductiveSingleResponse<ProductiveTimeEntry>> {
    return timeEntries.updateTimeEntry(this.request, id, data);
  }
  deleteTimeEntry(id: string): Promise<void> {
    return timeEntries.deleteTimeEntry(this.request, id);
  }

  /** Convenience: time entries in a date range. */
  getTimeEntriesInDateRange(
    startDate: string,
    endDate: string,
    additionalParams?: Omit<
      timeEntries.ListTimeEntriesParams,
      'after' | 'before'
    >
  ): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    return this.listTimeEntries({
      after: startDate,
      before: endDate,
      ...additionalParams,
    });
  }
  /** Convenience: today's time entries. */
  getTodayTimeEntries(
    additionalParams?: Omit<timeEntries.ListTimeEntriesParams, 'date'>
  ): Promise<ProductiveResponse<ProductiveTimeEntry>> {
    const today = new Date().toISOString().split('T')[0]!;
    return this.listTimeEntries({ date: today, ...additionalParams });
  }

  // ─── Deals & services ──────────────────────────────────────────────────────
  listProjectDeals(
    params: deals.ListProjectDealsParams
  ): Promise<ProductiveResponse<ProductiveDeal>> {
    return deals.listProjectDeals(this.request, params);
  }
  /** rb2: full org-wide deal list (legacy untyped). */
  listDeals(params?: { project_id?: string }): Promise<unknown[]> {
    return deals.listDealsAllPages(this.request, params);
  }
  listDealServices(
    params: services.ListDealServicesParams
  ): Promise<ProductiveResponse<ProductiveService>> {
    return services.listDealServices(this.request, params);
  }
  /** rb2: full service list for a deal (legacy untyped). */
  listServicesForDeal(dealId: string): Promise<unknown[]> {
    return services.listServicesForDealAllPages(this.request, dealId);
  }
  listServices(
    params?: services.ListServicesParams
  ): Promise<ProductiveResponse<ProductiveService>> {
    return services.listServices(this.request, params);
  }

  // ─── Bookings ──────────────────────────────────────────────────────────────
  listBookings(
    params?: bookings.ListBookingsParams
  ): Promise<ProductiveResponse<ProductiveBooking>> {
    return bookings.listBookings(this.request, params);
  }
  /** rb2: bookings + included person/service/deal/project chain. */
  listBookingsWithIncluded(params?: {
    after?: string;
    before?: string;
    person_id?: string;
  }): Promise<{ bookings: unknown[]; included: unknown[] }> {
    return bookings.listBookingsWithIncludedAllPages(this.request, params);
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────
  listInvoices(
    params?: invoices.ListInvoicesParams
  ): Promise<ProductiveResponse<ProductiveInvoice>> {
    return invoices.listInvoices(this.request, params);
  }
  getInvoice(
    invoiceId: string
  ): Promise<ProductiveSingleResponse<ProductiveInvoice>> {
    return invoices.getInvoice(this.request, invoiceId);
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  listExpenses(
    params?: expenses.ListExpensesParams
  ): Promise<ProductiveResponse<ProductiveExpense>> {
    return expenses.listExpenses(this.request, params);
  }
  createExpense(
    data: ProductiveExpenseCreate
  ): Promise<ProductiveSingleResponse<ProductiveExpense>> {
    return expenses.createExpense(this.request, data);
  }

  // ─── Memberships ───────────────────────────────────────────────────────────
  listMemberships(
    params?: memberships.ListMembershipsParams
  ): Promise<ProductiveResponse<ProductiveMembership>> {
    return memberships.listMemberships(this.request, params);
  }

  // ─── Todos ─────────────────────────────────────────────────────────────────
  listTodos(
    taskId: string
  ): Promise<ProductiveResponse<ProductiveTodo>> {
    return todos.listTodos(this.request, taskId);
  }
  getTodo(
    todoId: string
  ): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return todos.getTodo(this.request, todoId);
  }
  createTodo(
    data: ProductiveTodoCreate
  ): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return todos.createTodo(this.request, data);
  }
  updateTodo(
    todoId: string,
    attrs: { description?: string; closed?: boolean }
  ): Promise<ProductiveSingleResponse<ProductiveTodo>> {
    return todos.updateTodo(this.request, todoId, attrs);
  }
  deleteTodo(todoId: string): Promise<void> {
    return todos.deleteTodo(this.request, todoId);
  }

  // ─── Task dependencies ─────────────────────────────────────────────────────
  listTaskDependencies(
    taskId: string
  ): Promise<ProductiveResponse<ProductiveDependency>> {
    return dependencies.listTaskDependencies(this.request, taskId);
  }
  getTaskDependency(
    dependencyId: string
  ): Promise<ProductiveSingleResponse<ProductiveDependency>> {
    return dependencies.getTaskDependency(this.request, dependencyId);
  }
  addTaskDependency(
    depData: ProductiveDependencyCreate
  ): Promise<ProductiveSingleResponse<ProductiveDependency>> {
    return dependencies.addTaskDependency(this.request, depData);
  }
  removeTaskDependency(dependencyId: string): Promise<void> {
    return dependencies.removeTaskDependency(this.request, dependencyId);
  }

  // ─── Pages ─────────────────────────────────────────────────────────────────
  listPages(
    params?: pages.ListPagesParams
  ): Promise<ProductiveResponse<ProductivePage>> {
    return pages.listPages(this.request, params);
  }
  getPage(
    pageId: string
  ): Promise<ProductiveSingleResponse<ProductivePage>> {
    return pages.getPage(this.request, pageId);
  }
  createPage(
    input: pages.CreatePageInput
  ): Promise<ProductiveSingleResponse<ProductivePage>> {
    return pages.createPage(this.request, input);
  }
  updatePage(
    pageId: string,
    input: pages.UpdatePageInput
  ): Promise<ProductiveSingleResponse<ProductivePage>> {
    return pages.updatePage(this.request, pageId, input);
  }
  deletePage(pageId: string): Promise<void> {
    return pages.deletePage(this.request, pageId);
  }
  movePage(
    pageId: string,
    targetDocId: string
  ): Promise<ProductiveSingleResponse<ProductivePage>> {
    return pages.movePage(this.request, pageId, targetDocId);
  }
  copyPage(
    templateId: string,
    projectId?: string
  ): Promise<ProductiveSingleResponse<ProductivePage>> {
    return pages.copyPage(this.request, templateId, projectId);
  }

  // ─── Folders ───────────────────────────────────────────────────────────────
  listFolders(
    params?: folders.ListFoldersParams
  ): Promise<ProductiveResponse<ProductiveFolder>> {
    return folders.listFolders(this.request, params);
  }
  getFolder(
    folderId: string
  ): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return folders.getFolder(this.request, folderId);
  }
  createFolder(
    data: ProductiveFolderCreate
  ): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return folders.createFolder(this.request, data);
  }
  updateFolder(
    folderId: string,
    attrs: { name: string }
  ): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return folders.updateFolder(this.request, folderId, attrs);
  }
  archiveFolder(folderId: string): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return folders.archiveFolder(this.request, folderId);
  }
  restoreFolder(
    folderId: string
  ): Promise<ProductiveSingleResponse<ProductiveFolder>> {
    return folders.restoreFolder(this.request, folderId);
  }

  // ─── Attachments ───────────────────────────────────────────────────────────
  listAttachments(
    params: attachments.ListAttachmentsParams
  ): Promise<ProductiveResponse<ProductiveAttachment>> {
    return attachments.listAttachments(this.request, params);
  }

  // ─── Legacy untyped pagination (used by rb2 tools) ────────────────────────
  getAllPages<T>(
    path: string,
    baseParams: URLSearchParams
  ): Promise<T[]> {
    return legacyGetAllPages<T>(this.request, path, baseParams);
  }
}
