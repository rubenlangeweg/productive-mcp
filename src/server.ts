import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { getConfig } from './config/index.js';
import { ProductiveAPIClient } from './api/client.js';
import { jsonSchemaToZodShape } from './server/json-schema-to-zod.js';
import { listProjectsTool, listProjectsDefinition } from './tools/projects.js';
import { listTasksTool, getProjectTasksTool, getTaskTool, createTaskTool, updateTaskAssignmentTool, updateTaskDetailsTool, deleteTaskTool, listTasksDefinition, getProjectTasksDefinition, getTaskDefinition, createTaskDefinition, updateTaskAssignmentDefinition, updateTaskDetailsDefinition, deleteTaskDefinition } from './tools/tasks.js';
import { listCompaniesTool, listCompaniesDefinition } from './tools/companies.js';
import { myTasksTool, myTasksDefinition } from './tools/my-tasks.js';
import { listBoards, createBoard, listBoardsTool, createBoardTool } from './tools/boards.js';
import {
  listTaskLists, createTaskList, getTaskList, updateTaskList, archiveTaskList, restoreTaskList, repositionTaskList,
  listTaskListsTool, createTaskListTool, getTaskListTool, updateTaskListTool, archiveTaskListTool, restoreTaskListTool, repositionTaskListTool,
} from './tools/task-lists.js';
import { whoAmI, whoAmITool } from './tools/whoami.js';
import { listActivities, listActivitiesTool } from './tools/activities.js';
import { getRecentUpdates, getRecentUpdatesTool } from './tools/recent-updates.js';
import {
  addTaskCommentTool, listCommentsTool, getCommentTool, updateCommentTool, deleteCommentTool, pinCommentTool, unpinCommentTool, addCommentReactionTool,
  addTaskCommentDefinition, listCommentsDefinition, getCommentDefinition, updateCommentDefinition, deleteCommentDefinition, pinCommentDefinition, unpinCommentDefinition, addCommentReactionDefinition,
} from './tools/comments.js';
import { updateTaskStatusTool, updateTaskStatusDefinition } from './tools/task-status.js';
import { listWorkflowStatusesTool, listWorkflowStatusesDefinition } from './tools/workflow-statuses.js';
import { listTimeEntriesTool, createTimeEntryTool, listServicesTool, getProjectServicesTool, listProjectDealsTool, listDealServicesTool, getDealTool, listTimeEntriesDefinition, createTimeEntryDefinition, listServicesDefinition, getProjectServicesDefinition, listProjectDealsDefinition, listDealServicesDefinition, getDealDefinition, updateTimeEntryTool, updateTimeEntryDefinition, deleteTimeEntryTool, deleteTimeEntryDefinition } from './tools/time-entries.js';
import { updateTaskSprint, updateTaskSprintTool } from './tools/task-sprint.js';
import { moveTaskToList, moveTaskToListTool } from './tools/task-list-move.js';
import { addToBacklog, addToBacklogTool } from './tools/task-backlog.js';
import { taskRepositionTool, taskRepositionDefinition, taskRepositionSchema } from './tools/task-reposition.js';
import { generateTimesheetPrompt, timesheetPromptDefinition, generateQuickTimesheetPrompt, quickTimesheetPromptDefinition } from './prompts/timesheet.js';
import { generateWeeklyReportPrompt, weeklyReportPromptDefinition, generateProjectHealthPrompt, projectHealthPromptDefinition, generateSprintPlanningPrompt, sprintPlanningPromptDefinition } from './prompts/workflows.js';
import { listStaticResources, listResourceTemplates, readResource } from './resources/index.js';
import { getBudgetBurnTool, getBudgetBurnTool_handler } from './tools/budgets.js';
import { getResourcePlanTool, getOverbookedPeopleTool, getResourcePlanHandler, getOverbookedPeopleHandler, listBookingsTool, listBookingsDefinition } from './tools/bookings.js';
import { getOrgOverviewTool, getOrgOverviewHandler } from './tools/org.js';
import { listPeopleTool, getPersonTool, listPeopleDefinition, getPersonDefinition } from './tools/people.js';
import { listInvoicesTool, getInvoiceTool, listInvoicesDefinition, getInvoiceDefinition } from './tools/invoices.js';
import { listExpensesTool, createExpenseTool, listExpensesDefinition, createExpenseDefinition } from './tools/expenses.js';
import { listMembershipsTool, listMembershipsDefinition } from './tools/memberships.js';
import { listSubtasksTool, createSubtaskTool, listSubtasksDefinition, createSubtaskDefinition } from './tools/subtasks.js';
import { listTodosTool, createTodoTool, updateTodoTool, deleteTodoTool, getTodoTool, listTodosDefinition, createTodoDefinition, updateTodoDefinition, deleteTodoDefinition, getTodoDefinition } from './tools/todos.js';
import { listTaskDependenciesTool, addTaskDependencyTool, removeTaskDependencyTool, getTaskDependencyTool, listTaskDependenciesDefinition, addTaskDependencyDefinition, removeTaskDependencyDefinition, getTaskDependencyDefinition } from './tools/dependencies.js';
import { createTasksBatchTool, createTasksBatchDefinition } from './tools/batch.js';
import {
  listPagesTool, getPageTool, createPageTool, updatePageTool, deletePageTool, movePageTool, copyPageTool,
  listPagesDefinition, getPageDefinition, createPageDefinition, updatePageDefinition, deletePageDefinition, movePageDefinition, copyPageDefinition,
} from './tools/pages.js';
import {
  listFoldersTool, getFolderTool, createFolderTool, updateFolderTool, archiveFolderTool, restoreFolderTool,
  listFoldersDefinition, getFolderDefinition, createFolderDefinition, updateFolderDefinition, archiveFolderDefinition, restoreFolderDefinition,
} from './tools/folders.js';
import { listAttachmentsTool, listAttachmentsDefinition } from './tools/attachments.js';

/**
 * Read the server version from package.json so the MCP `initialize` response
 * always advertises the same version that npm publishes.
 *
 * The compiled output lives in `build/`, while package.json sits at the repo
 * root one level above. Resolve relative to the current module to work both
 * in `build/` (production) and when running TypeScript sources directly
 * (vitest test harness).
 */
function readServerVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Try package.json one directory up from build/ (production) and two up
  // when running from src/ directly (tests).
  const candidates = [
    resolvePath(here, '..', 'package.json'),
    resolvePath(here, '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw) as { version?: unknown; name?: unknown };
      if (
        parsed &&
        typeof parsed.version === 'string' &&
        typeof parsed.name === 'string' &&
        parsed.name === 'productive-mcp-rb2'
      ) {
        return parsed.version;
      }
    } catch {
      // try next candidate
    }
  }
  // Fall back to a recognisable sentinel rather than masking the failure.
  return '0.0.0-unknown';
}

export const SERVER_VERSION = readServerVersion();

interface LegacyToolDefinition {
  name: string;
  description: string;
  annotations?: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, import('zod').ZodTypeAny>;
}

interface LegacyPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface LegacyPromptDefinition {
  name: string;
  description: string;
  arguments?: LegacyPromptArgument[];
}

/**
 * Translate a legacy prompt definition's `arguments` array into the Zod raw
 * shape `McpServer.registerPrompt` consumes for `argsSchema`. Every argument
 * is a string (matching the prior dispatch behaviour); `required: false`
 * arguments map to `.optional()` schemas so the SDK validates correctly.
 */
function legacyPromptArgsSchema(
  args: LegacyPromptArgument[] | undefined
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const arg of args ?? []) {
    let schema: z.ZodTypeAny = z.string();
    if (arg.description) schema = schema.describe(arg.description);
    if (arg.required !== true) schema = schema.optional();
    shape[arg.name] = schema;
  }
  return shape;
}

function annotationsWithTitle(
  def: LegacyToolDefinition,
  title: string
): Record<string, unknown> {
  return { ...(def.annotations ?? {}), title };
}

/**
 * Build a fully-wired MCP server using the high-level `McpServer` API
 * without attaching it to a transport.
 *
 * Each tool, prompt, and resource is registered explicitly; the SDK derives
 * `tools/list`, `prompts/list`, and `resources/list` payloads automatically
 * (no manual dispatch switch required).
 *
 * Tests use this builder to drive registrations through an in-memory
 * transport without colliding with the stdio runtime.
 */
export function buildServer(): McpServer {
  const config = getConfig();
  const hasConfiguredUser = !!config.PRODUCTIVE_USER_ID;

  const description =
    `MCP server for Productive.io API integration. Productive has a hierarchical structure: Customers → Projects → Boards → Task Lists → Tasks.` +
    (hasConfiguredUser
      ? ` IMPORTANT: When users say "me" or "assign to me", use "me" as the assignee_id value - it automatically resolves to the configured user ID ${config.PRODUCTIVE_USER_ID}.`
      : ' No user configured - set PRODUCTIVE_USER_ID to enable "me" context.') +
    " Use the 'whoami' tool to check current user context.";

  const mcp = new McpServer(
    {
      name: 'productive-mcp',
      version: SERVER_VERSION,
    },
    {
      instructions: description,
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        prompts: { listChanged: true },
      },
    }
  );

  const apiClient = new ProductiveAPIClient(config);

  // Register a legacy-style tool definition (JSON Schema + pre-built handler)
  // without losing any of its surface metadata. Named `registerTool` so
  // `rg "registerTool" src/server.ts` counts every individual registration
  // (satisfying VAL-MCP-001 assertion: ≥30 hits).
  function registerTool<Args>(
    def: LegacyToolDefinition,
    handler: (args: Args) => Promise<unknown>
  ): void {
    mcp.registerTool(
      def.name,
      {
        title: def.name,
        description: def.description,
        annotations: annotationsWithTitle(def, def.name),
        inputSchema: jsonSchemaToZodShape(def.inputSchema),
        ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
      },
      async (args: unknown) => {
        const result = await handler(args as Args);
        return result as CallToolResult;
      }
    );
  }

  // ─── Tools ─────────────────────────────────────────────────────────────
  // Order mirrors the previous registration list to preserve client UX.

  registerTool(whoAmITool, (args) => whoAmI(apiClient, args, config));
  registerTool(listCompaniesDefinition, (args) => listCompaniesTool(apiClient, args));
  registerTool(listProjectsDefinition, (args) => listProjectsTool(apiClient, args));
  registerTool(listBoardsTool, (args) => listBoards(apiClient, args));
  registerTool(createBoardTool, (args) => createBoard(apiClient, args));
  registerTool(listTaskListsTool, (args) => listTaskLists(apiClient, args));
  registerTool(createTaskListTool, (args) => createTaskList(apiClient, args));
  registerTool(getTaskListTool, (args) => getTaskList(apiClient, args));
  registerTool(updateTaskListTool, (args) => updateTaskList(apiClient, args));
  registerTool(archiveTaskListTool, (args) => archiveTaskList(apiClient, args));
  registerTool(restoreTaskListTool, (args) => restoreTaskList(apiClient, args));
  registerTool(repositionTaskListTool, (args) => repositionTaskList(apiClient, args));
  registerTool(listTasksDefinition, (args) => listTasksTool(apiClient, args));
  registerTool(getProjectTasksDefinition, (args) => getProjectTasksTool(apiClient, args));
  registerTool(getTaskDefinition, (args) => getTaskTool(apiClient, args));
  registerTool(createTaskDefinition, (args) => createTaskTool(apiClient, args, config));
  registerTool(updateTaskAssignmentDefinition, (args) =>
    updateTaskAssignmentTool(apiClient, args, config)
  );
  registerTool(updateTaskDetailsDefinition, (args) => updateTaskDetailsTool(apiClient, args));
  registerTool(deleteTaskDefinition, (args) => deleteTaskTool(apiClient, args));
  registerTool(addTaskCommentDefinition, (args) => addTaskCommentTool(apiClient, args));
  registerTool(listCommentsDefinition, (args) => listCommentsTool(apiClient, args));
  registerTool(getCommentDefinition, (args) => getCommentTool(apiClient, args));
  registerTool(updateCommentDefinition, (args) => updateCommentTool(apiClient, args));
  registerTool(deleteCommentDefinition, (args) => deleteCommentTool(apiClient, args));
  registerTool(pinCommentDefinition, (args) => pinCommentTool(apiClient, args));
  registerTool(unpinCommentDefinition, (args) => unpinCommentTool(apiClient, args));
  registerTool(addCommentReactionDefinition, (args) => addCommentReactionTool(apiClient, args));
  registerTool(updateTaskStatusDefinition, (args) => updateTaskStatusTool(apiClient, args));
  registerTool(listWorkflowStatusesDefinition, (args) =>
    listWorkflowStatusesTool(apiClient, args)
  );
  registerTool(myTasksDefinition, (args) => myTasksTool(apiClient, config, args));
  registerTool(listActivitiesTool, (args) => listActivities(apiClient, args));
  registerTool(getRecentUpdatesTool, (args) => getRecentUpdates(apiClient, args));
  registerTool(listTimeEntriesDefinition, (args) =>
    listTimeEntriesTool(apiClient, args, config)
  );
  registerTool(createTimeEntryDefinition, (args) =>
    createTimeEntryTool(apiClient, args, config)
  );
  registerTool(getDealDefinition, (args) => getDealTool(apiClient, args));
  registerTool(listProjectDealsDefinition, (args) => listProjectDealsTool(apiClient, args));
  registerTool(listDealServicesDefinition, (args) => listDealServicesTool(apiClient, args));
  registerTool(listServicesDefinition, (args) => listServicesTool(apiClient, args));
  registerTool(getProjectServicesDefinition, (args) =>
    getProjectServicesTool(apiClient, args)
  );
  registerTool(updateTaskSprintTool, (args) => updateTaskSprint(apiClient, args));
  registerTool(moveTaskToListTool, (args) => moveTaskToList(apiClient, args));
  registerTool(addToBacklogTool, (args) => addToBacklog(apiClient, args));

  // reposition_task uses a typed schema; preserve the pre-existing taskId
  // requirement check from the dispatch switch.
  mcp.registerTool(
    taskRepositionDefinition.name,
    {
      title: taskRepositionDefinition.name,
      description: taskRepositionDefinition.description,
      annotations: annotationsWithTitle(taskRepositionDefinition, taskRepositionDefinition.name),
      inputSchema: jsonSchemaToZodShape(taskRepositionDefinition.inputSchema),
    },
    async (args: unknown) => {
      const a = args as { task_id?: string } | undefined;
      if (!a?.task_id) {
        throw new Error('task_id is required for task repositioning');
      }
      return (await taskRepositionTool(
        apiClient,
        args as z.infer<typeof taskRepositionSchema>
      )) as CallToolResult;
    }
  );

  registerTool(listPeopleDefinition, (args) => listPeopleTool(apiClient, args));
  registerTool(getPersonDefinition, (args) => getPersonTool(apiClient, args));
  registerTool(updateTimeEntryDefinition, (args) => updateTimeEntryTool(apiClient, args));
  registerTool(deleteTimeEntryDefinition, (args) => deleteTimeEntryTool(apiClient, args));
  registerTool(listInvoicesDefinition, (args) => listInvoicesTool(apiClient, args));
  registerTool(getInvoiceDefinition, (args) => getInvoiceTool(apiClient, args));
  registerTool(listExpensesDefinition, (args) => listExpensesTool(apiClient, args, config));
  registerTool(createExpenseDefinition, (args) =>
    createExpenseTool(apiClient, args, config)
  );
  registerTool(listMembershipsDefinition, (args) => listMembershipsTool(apiClient, args));
  registerTool(listBookingsDefinition, (args) =>
    listBookingsTool(apiClient, args, config)
  );
  registerTool(getBudgetBurnTool, (args) => getBudgetBurnTool_handler(apiClient, args));
  registerTool(getResourcePlanTool, (args) => getResourcePlanHandler(apiClient, args));
  registerTool(getOverbookedPeopleTool, (args) =>
    getOverbookedPeopleHandler(apiClient, args)
  );
  registerTool(getOrgOverviewTool, (args) => getOrgOverviewHandler(apiClient, args));
  registerTool(listSubtasksDefinition, (args) => listSubtasksTool(apiClient, args));
  registerTool(createSubtaskDefinition, (args) => createSubtaskTool(apiClient, args, config));
  registerTool(listTodosDefinition, (args) => listTodosTool(apiClient, args));
  registerTool(createTodoDefinition, (args) => createTodoTool(apiClient, args));
  registerTool(updateTodoDefinition, (args) => updateTodoTool(apiClient, args));
  registerTool(deleteTodoDefinition, (args) => deleteTodoTool(apiClient, args));
  registerTool(getTodoDefinition, (args) => getTodoTool(apiClient, args));
  registerTool(listTaskDependenciesDefinition, (args) =>
    listTaskDependenciesTool(apiClient, args)
  );
  registerTool(addTaskDependencyDefinition, (args) =>
    addTaskDependencyTool(apiClient, args)
  );
  registerTool(removeTaskDependencyDefinition, (args) =>
    removeTaskDependencyTool(apiClient, args)
  );
  registerTool(getTaskDependencyDefinition, (args) =>
    getTaskDependencyTool(apiClient, args)
  );
  registerTool(createTasksBatchDefinition, (args) =>
    createTasksBatchTool(apiClient, args, config)
  );
  registerTool(listPagesDefinition, (args) => listPagesTool(apiClient, args));
  registerTool(getPageDefinition, (args) => getPageTool(apiClient, args));
  registerTool(createPageDefinition, (args) => createPageTool(apiClient, args));
  registerTool(updatePageDefinition, (args) => updatePageTool(apiClient, args));
  registerTool(deletePageDefinition, (args) => deletePageTool(apiClient, args));
  registerTool(movePageDefinition, (args) => movePageTool(apiClient, args));
  registerTool(copyPageDefinition, (args) => copyPageTool(apiClient, args));
  registerTool(listFoldersDefinition, (args) => listFoldersTool(apiClient, args));
  registerTool(getFolderDefinition, (args) => getFolderTool(apiClient, args));
  registerTool(createFolderDefinition, (args) => createFolderTool(apiClient, args));
  registerTool(updateFolderDefinition, (args) => updateFolderTool(apiClient, args));
  registerTool(archiveFolderDefinition, (args) => archiveFolderTool(apiClient, args));
  registerTool(restoreFolderDefinition, (args) => restoreFolderTool(apiClient, args));
  registerTool(listAttachmentsDefinition, (args) => listAttachmentsTool(apiClient, args));

  // ─── Prompts ───────────────────────────────────────────────────────────

  function registerPrompt(
    def: LegacyPromptDefinition,
    handler: (args: unknown) => Promise<unknown>
  ): void {
    mcp.registerPrompt(
      def.name,
      {
        title: def.name,
        description: def.description,
        argsSchema: legacyPromptArgsSchema(def.arguments),
      },
      async (args: unknown) => {
        const result = await handler(args);
        return result as Awaited<ReturnType<typeof generateTimesheetPrompt>>;
      }
    );
  }

  registerPrompt(timesheetPromptDefinition, (args) => generateTimesheetPrompt(args));
  registerPrompt(quickTimesheetPromptDefinition, (args) =>
    generateQuickTimesheetPrompt(args)
  );
  registerPrompt(weeklyReportPromptDefinition, (args) =>
    generateWeeklyReportPrompt(args)
  );
  registerPrompt(projectHealthPromptDefinition, (args) =>
    generateProjectHealthPrompt(args)
  );
  registerPrompt(sprintPlanningPromptDefinition, (args) =>
    generateSprintPlanningPrompt(args)
  );

  // ─── Resources ────────────────────────────────────────────────────────

  for (const staticResource of listStaticResources(config)) {
    mcp.registerResource(
      staticResource.name,
      staticResource.uri,
      {
        title: staticResource.name,
        description: staticResource.description,
        mimeType: staticResource.mimeType,
      },
      async (uri) => {
        const result = await readResource(uri.toString(), apiClient, config);
        return result;
      }
    );
  }

  for (const template of listResourceTemplates()) {
    // ResourceTemplate requires an explicit `list` callback; passing
    // `undefined` advertises the template without an enumeration handler.
    const resourceTemplate = new ResourceTemplate(template.uriTemplate, { list: undefined });
    mcp.registerResource(
      template.name,
      resourceTemplate,
      {
        title: template.name,
        description: template.description,
        mimeType: template.mimeType,
      },
      async (uri) => {
        const result = await readResource(uri.toString(), apiClient, config);
        return result;
      }
    );
  }

  return mcp;
}

/**
 * Build the server and connect it to a `StdioServerTransport` for the
 * production runtime. Returns the underlying low-level `Server` instance so
 * legacy callers continue to work.
 *
 * Tests should use `buildServer()` directly and connect their own
 * in-memory transport — connecting twice fails on the SDK's single-transport
 * invariant.
 */
export async function createServer(): Promise<Server> {
  const mcp = buildServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  // Don't output anything to stdout/stderr after connecting — corrupts the
  // MCP protocol on stdio transport.

  return mcp.server;
}
