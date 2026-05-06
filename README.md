# productive-mcp-rb2

[![npm version](https://badge.fury.io/js/productive-mcp-rb2.svg)](https://www.npmjs.com/package/productive-mcp-rb2)

An MCP (Model Context Protocol) server for [Productive.io](https://productive.io), extended with delivery-focused tools for budget burn, resource planning, and org overview.

Based on [berwickgeek/productive-mcp](https://github.com/berwickgeek/productive-mcp) — extended by [Ruben Langeweg](https://github.com/rubenlangeweg).

---

## Quick Start

### 1. Get your credentials

1. Log in to [Productive.io](https://productive.io)
2. Go to **Settings → API integrations**
3. Generate a new token
4. Note your **API token** and **Organisation ID**

To find your user ID: use the `whoami` tool after setup, or check your profile URL in Productive.io.

### 2. Configure your MCP host

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "productive": {
      "command": "npx",
      "args": ["-y", "productive-mcp-rb2"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token",
        "PRODUCTIVE_ORG_ID": "your_org_id",
        "PRODUCTIVE_USER_ID": "your_user_id"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

#### Claude Code

```bash
claude mcp add productive -- npx -y productive-mcp-rb2
```

Then set your environment variables in `~/.zshrc` or `~/.bashrc`:

```bash
export PRODUCTIVE_API_TOKEN="your_api_token"
export PRODUCTIVE_ORG_ID="your_org_id"
export PRODUCTIVE_USER_ID="your_user_id"
```

### 3. Try it

Once configured, ask your AI assistant:

```
"Show me my open tasks"
"Log 2 hours to the Gadero project for today"
"Which projects are over 80% budget burn?"
"Mark task 99 as Done"
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRODUCTIVE_API_TOKEN` | Yes | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | Yes | Your organisation ID |
| `PRODUCTIVE_USER_ID` | Optional | Your user ID — enables `my_tasks`, `me` shorthand in all tools, and the `productive://me/*` resources |

---

## Installation

### Via npx (no install required)

```bash
npx productive-mcp-rb2
```

### Global install

```bash
npm install -g productive-mcp-rb2
```

### Updating

**npx users** — no action needed. Restart your MCP host and `npx` resolves the latest published version.

**Global install users:**

```bash
npm install -g productive-mcp-rb2@latest
```

**Local checkout users:**

```bash
git pull && npm install && npm run build
```

Then restart your MCP host.

---

## Automated npm publishing

This repo includes `.github/workflows/npm-publish.yml`.

- Trigger: every push to `main`
- Guardrail: skips publishing if the current `package.json` version already exists on npm
- Auth: requires repository secret `NPM_TOKEN`

Typical release flow:

```bash
npm version patch
git push
```

---

## Tool Reference

Tools are listed in tables, grouped by area. Read-only tools are safe to call freely; write/mutate tools are noted in the description.

### People & Identity

| Tool | Description |
|------|-------------|
| `whoami` | Get the current user context — shows which user ID is configured as "me". |
| `list_people` | List team members. Optional `company_id`, `project_id`, `is_active`, `email`, `limit`. |
| `get_person` | Get details about a person. Requires `person_id`. |

### Projects & Companies

| Tool | Description |
|------|-------------|
| `list_projects` | List projects in your organisation. Optional `status`, `company_id`, `limit`. |
| `list_companies` | List companies (clients). Optional `status`, `limit`. |

### Tasks

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks. Optional `project_id`, `assignee_id`, `status`, `limit`. |
| `get_task` | Get full details of a task. Requires `task_id`. |
| `get_project_tasks` | Get all tasks for a project. Requires `project_id`. Optional `status`. |
| `my_tasks` | Get tasks assigned to the configured user. Requires `PRODUCTIVE_USER_ID`. |
| `create_task` | Create a task. Requires `title`. Optional `description`, `project_id`, `board_id`, `task_list_id`, `assignee_id` (use `"me"`), `due_date`, `status`. |
| `update_task_details` | Update title and/or description. Requires `task_id`. Optional `title`, `description`. |
| `update_task_assignment` | Set or clear a task's assignee. Requires `task_id`, `assignee_id` (use `"me"` or `"null"`). |
| `update_task_status` | Set task status by `workflow_status_id` OR `status_name` (case-insensitive, partial match). Requires `task_id`. |
| `update_task_sprint` | Move task to one or more sprints (custom field). Requires `task_id`. |
| `reposition_task` | Reposition a task within its list. Requires `taskId`. Optional `move_before_id`, `move_after_id`. |
| `move_task_to_list` | Move a task to a different task list. Requires `task_id`, `task_list_id`. |
| `add_to_backlog` | Add a task to the project backlog. Creates a Backlog list if missing. Requires `task_id`. |
| `create_tasks_batch` | Create multiple tasks at once. Requires `tasks` array. |
| `delete_task` | Permanently delete a task. Destructive. Requires `task_id`. |

### Subtasks

| Tool | Description |
|------|-------------|
| `list_subtasks` | List child tasks of a parent. Requires `parent_task_id`. Optional `limit`. |
| `create_subtask` | Create a subtask under a parent. Requires `parent_task_id`, `title`. Optional `project_id`, `task_list_id`, `assignee_id` (use `"me"`), `due_date`, `description`. |

### Task Todos / Checklists

| Tool | Description |
|------|-------------|
| `list_todos` | List checklist items on a task. Requires `task_id`. |
| `get_todo` | Get a single todo. Requires `todo_id`. |
| `create_todo` | Add a checklist item. Requires `task_id`, `title`. |
| `update_todo` | Rename a todo or toggle completed. Requires `todo_id`. Optional `title`, `completed`. |
| `delete_todo` | Delete a checklist item. Destructive. Requires `todo_id`. |

### Task Dependencies

| Tool | Description |
|------|-------------|
| `list_task_dependencies` | List dependencies for a task. Requires `task_id`. |
| `get_task_dependency` | Get a single dependency by ID. Requires `dependency_id`. |
| `add_task_dependency` | Link two tasks. Requires `task_id`, `depends_on_task_id`. Optional `type` (`blocking` | `waiting_on` | `related`). |
| `remove_task_dependency` | Remove a dependency by its ID. Destructive. Requires `dependency_id`. |

### Comments

| Tool | Description |
|------|-------------|
| `list_comments` | List comments on a task. Requires `task_id`. Optional `project_id`, `limit`. |
| `get_comment` | Get a comment by ID. Requires `comment_id`. |
| `add_task_comment` | Add a comment to a task. Requires `task_id`, `comment`. |
| `update_comment` | Edit a comment's body. Requires `comment_id`, `body`. |
| `pin_comment` | Pin a comment to the top. Requires `comment_id`. |
| `unpin_comment` | Unpin a comment. Requires `comment_id`. |
| `add_comment_reaction` | Add a reaction (e.g. `like`). Requires `comment_id`, `reaction`. |
| `delete_comment` | Delete a comment. Destructive. Requires `comment_id`. |

### Attachments

| Tool | Description |
|------|-------------|
| `list_attachments` | List file attachments on a task or comment. Requires `task_id` or `comment_id`. |

### Boards & Task Lists

| Tool | Description |
|------|-------------|
| `list_boards` | List boards in a project. |
| `create_board` | Create a board. Requires `project_id`, `name`. |
| `list_task_lists` | List task lists. Optional `board_id`, `limit`. |
| `get_task_list` | Get a single task list. Requires `task_list_id`. |
| `create_task_list` | Create a task list. Requires `board_id`, `project_id`, `name`. |
| `update_task_list` | Rename a task list. Requires `task_list_id`, `name`. |
| `archive_task_list` | Archive a task list (reversible). Requires `task_list_id`. |
| `restore_task_list` | Restore an archived task list. Requires `task_list_id`. |
| `reposition_task_list` | Reposition a task list. Requires `task_list_id`. Optional `move_before_id`. |

### Folders

Folders group boards within a project.

| Tool | Description |
|------|-------------|
| `list_folders` | List folders. Optional `project_id`, `status` (1=active, 2=archived), `limit`. |
| `get_folder` | Get a single folder. Requires `folder_id`. |
| `create_folder` | Create a folder. Requires `project_id`, `name`. |
| `update_folder` | Rename a folder. Requires `folder_id`, `name`. |
| `archive_folder` | Archive a folder (reversible). Requires `folder_id`. |
| `restore_folder` | Restore an archived folder. Requires `folder_id`. |

### Workflow Statuses

| Tool | Description |
|------|-------------|
| `list_workflow_statuses` | List workflow statuses. Optional `workflow_id`, `category_id` (1=Not Started, 2=Started, 3=Closed), `limit`. |

### Time Entries

Time entry creation follows a 5-step workflow: **project → deal → service → task → create**.

| Tool | Description |
|------|-------------|
| `list_time_entries` | View existing time entries. Optional `date`, `after`, `before`, `person_id` (use `"me"`), `project_id`, `limit`. |
| `create_time_entry` | Create a time entry (step 5 of the workflow). Requires `service_id`, `time`, `date`, `note` (≥10 chars). |
| `update_time_entry` | Update an existing time entry. Requires `time_entry_id`. Optional `time`, `note`, `date`. |
| `delete_time_entry` | Delete a time entry. Destructive. Requires `time_entry_id`. |
| `list_services` | List all services in the org. |
| `list_project_deals` | List deals/budgets for a project (step 2). Requires `project_id`. |
| `list_deal_services` | List services for a deal (step 3). Requires `deal_id`. |
| `get_project_services` | Convenience: get services for a project across all deals. Requires `project_id`. |

### Memberships

| Tool | Description |
|------|-------------|
| `list_memberships` | List project/team memberships. Optional `project_id`, `person_id`, `limit`. |

### Expenses

| Tool | Description |
|------|-------------|
| `list_expenses` | List expenses. Optional `person_id` (use `"me"`), `project_id`, `after`, `before`, `limit`. |
| `create_expense` | Log an expense. Requires `date`, `amount`. Optional `project_id`, `deal_id`, `note`, `billable`. |

### Invoices

| Tool | Description |
|------|-------------|
| `list_invoices` | List invoices. Optional `company_id`, `project_id`, `status`, `after`, `before`, `limit`. |
| `get_invoice` | Get a single invoice. Requires `invoice_id`. |

### Activity & Pages

| Tool | Description |
|------|-------------|
| `list_activities` | List activities (changes/updates). Optional `project_id`, `person_id`, date range, `limit`. |
| `get_recent_updates` | Summary of recent updates with breakdown by item type. Optional `days`. |
| `list_pages` | List knowledge base pages. Optional `project_id`, `limit`. |
| `get_page` | Get full content of a page. Requires `page_id`. |
| `create_page` | Create a new page. Requires `project_id`, `title`. Optional `body` (HTML), `parent_page_id`. |
| `update_page` | Update title and/or body. Requires `page_id`. Optional `title`, `body`. |
| `move_page` | Move a page under another parent. Requires `page_id`, `target_doc_id`. |
| `copy_page` | Copy a page from a template. Requires `template_id`. Optional `project_id`. |
| `delete_page` | Delete a page. Destructive. Requires `page_id`. |

---

### rb2 Delivery Tools

These tools are extended beyond the core Productive.io API and are tailored for rb2's delivery workflow.

| Tool | Description |
|------|-------------|
| `get_budget_burn` | Budget burn analysis with RAG status (Green <70%, Amber 70-90%, Red >90%). Optional `min_burn_pct`, `project_id`. |
| `get_resource_plan` | Team bookings and utilisation for a date range. Optional `person_name`, `project_id`, `after`, `before`. |
| `get_overbooked_people` | Detect team members exceeding capacity. Optional `threshold_pct`, `after`, `before`. |
| `get_org_overview` | rb2 headcount per subsidiary (NL, SCAPE, Code Blue, CN, PT, NG) with active project counts. |
| `list_bookings` | Raw resource bookings/capacity entries. Optional `person_id` (use `"me"`), `project_id`, date range. |

---

## Common Workflows

### Updating task status by name

`update_task_status` accepts a `status_name` instead of an ID — it auto-resolves against the project's workflow statuses (case-insensitive, partial match).

```
"Move task 12345 to In Progress"
   → update_task_status(task_id="12345", status_name="In Progress")
```

If the name is ambiguous or missing, the tool returns the available statuses so you can retry with `workflow_status_id`.

### Creating a subtask

```
"Add a subtask 'Write tests' under task 12345 assigned to me"
   → create_subtask(parent_task_id="12345", title="Write tests", assignee_id="me")
```

### Logging time (5-step flow)

```
list_projects
   → list_project_deals(project_id)
      → list_deal_services(deal_id)
         → get_project_tasks(project_id)         # optional, to link a task
            → create_time_entry(service_id, time, date, note)
```

The simplest approach is to use the `timesheet` prompt, which walks through every step automatically.

### Managing knowledge base pages

```
"Create a runbook for project 12345 with the deployment steps"
   → create_page(project_id="12345", title="Deployment Runbook", body="<p>...</p>")

"Move page 999 under page 100"
   → move_page(page_id="999", target_doc_id="100")
```

### Pinning an important comment

```
list_comments(task_id) → pick the comment ID → pin_comment(comment_id)
```

---

## Prompts (5 total)

Prompts are pre-built workflow templates that guide the AI through multi-step operations. Invoke them by name in Claude Desktop or with `/mcp__productive__<name>` in Claude Code.

### `timesheet`
Guided workflow for creating timesheet entries. Walks through project → budget → service → task → time entry selection with proper validation. Accepts optional hints to pre-fill the workflow.

Arguments:
- `project` — project name or ID to start with (optional)
- `date` — `today`, `yesterday`, or `YYYY-MM-DD` (optional)
- `time` — duration like `"2h"`, `"120m"`, `"1.5h"` (optional)
- `work_description` — brief description of work performed (optional)

### `quick_timesheet`
Step-by-step guidance for a specific stage of the timesheet workflow. Use when you're already partway through and need help with a specific step: `project`, `budget`, `service`, `task`, or `create`.

Arguments:
- `step` — current step: `project`, `budget`, `service`, `task`, or `create`
- `project_id` — project ID if already selected (optional)
- `deal_id` — deal/budget ID if already selected (optional)
- `service_id` — service ID if already selected (optional)
- `task_id` — task ID if already selected (optional)

### `weekly_report`
Generate a structured weekly status report for a team member: time logged, tasks completed, in-progress work.

Arguments:
- `person_id` — person to report on (leave blank to use the configured user)
- `week_start` — start of the week in `YYYY-MM-DD` format (defaults to current Monday)

### `project_health`
Full project health check: budget burn, open tasks, team capacity, and recent activity — produces a RAG-rated summary.

Arguments:
- `project_id` — the Productive.io project ID to analyse

### `sprint_planning`
Walk through sprint planning: review backlog, check capacity, select tasks, create new ones, and assign the team.

Arguments:
- `project_id` — the project ID to plan the sprint for
- `sprint_name` — name for the new sprint (e.g. `"Sprint 12"`)

---

## Resources (6 total)

Resources are read-only data sources you can reference directly. In Claude, prefix with `@productive` or use the URI scheme `productive://`.

| Resource | Description |
|----------|-------------|
| `productive://projects` | All active projects in Productive.io — names, IDs, and status. |
| `productive://org/overview` | rb2 headcount per subsidiary and total active projects. |
| `productive://me/tasks` | Open tasks assigned to the configured user. Requires `PRODUCTIVE_USER_ID`. |
| `productive://me/today` | Time entries logged today by the configured user. Requires `PRODUCTIVE_USER_ID`. |
| `productive://projects/{id}/tasks` *(template)* | Open tasks for a specific project. Replace `{id}`. |
| `productive://tasks/{id}` *(template)* | Full details of a specific task. Replace `{id}`. |

---

## Timesheet Workflow

The recommended workflow for logging time follows a strict hierarchy:

```
list_projects
    ↓
list_project_deals       (get budgets for the project)
    ↓
list_deal_services       (get services for the budget)
    ↓
list_tasks               (optional: find task to link)
    ↓
create_time_entry        (log time with service_id + notes)
```

The simplest approach is to use the `timesheet` prompt, which walks through all steps automatically.

---

## Repository

[github.com/rubenlangeweg/productive-mcp](https://github.com/rubenlangeweg/productive-mcp)

## License

ISC
