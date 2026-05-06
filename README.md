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
"Give me a weekly report for this week"
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRODUCTIVE_API_TOKEN` | ✅ | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | ✅ | Your organisation ID |
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

## Full Reference

### Tools (55 total)

Tools are grouped by area. All read-only tools are safe to call freely; write/mutate tools are marked.

---

#### People & Identity

##### `whoami`
Get the current user context — shows which user ID is configured as "me" for all operations.

```
"Who am I in Productive?"
"What user ID is configured?"
```

##### `list_people`
List team members in your Productive organisation. Supports filtering by company, project membership, active status, and email. Use to find person IDs for task assignment, time entries, and filtering.

```
"Show me all active team members"
"Find the person ID for John Smith"
"Who is a member of project 12345?"
```

##### `get_person`
Get detailed information about a specific person by their Productive ID.

```
"Get details for person 67890"
```

---

#### Projects & Companies

##### `list_projects`
List projects in your organisation. Filter by status (active/archived) or company.

```
"List all active projects"
"Show me projects for company 12345"
"What projects are archived?"
```

##### `list_companies`
List companies (clients) in your organisation. Filter by active or archived status.

```
"Show me all clients"
"List archived companies"
```

---

#### Tasks

##### `list_tasks`
List tasks from Productive.io. Filter by project, assignee, and open/closed status.

```
"Show all open tasks in project 12345"
"What tasks are assigned to me?"
"List closed tasks for this project"
```

##### `my_tasks`
Get tasks assigned to the configured user. Requires `PRODUCTIVE_USER_ID` to be set.

```
"What are my open tasks?"
"Show me everything assigned to me"
```

##### `create_task`
Create a new task. If `PRODUCTIVE_USER_ID` is configured, use `"me"` as the assignee.

```
"Create a task 'Review PR #42' in project 12345"
"Add a task assigned to me in the Design board"
```

##### `update_task_details`
Update the title and/or description of an existing task.

```
"Rename task 99 to 'Final QA pass'"
"Update the description of task 99"
```

##### `update_task_assignment`
Update the assignee of an existing task. Use `"me"` for the configured user, or `"null"` to unassign.

```
"Assign task 99 to me"
"Reassign task 99 to person 67890"
"Unassign task 99"
```

##### `update_task_status`
Update the status of a task using a workflow status ID. Use `list_workflow_statuses` to see available IDs.

```
"Mark task 99 as Done"
"Move task 99 to In Progress"
```

##### `update_task_sprint`
Update the sprint(s) assigned to a task. Sprints are tracked using a custom field.

```
"Move task 99 to Sprint S04"
"Assign task 99 to sprints S03 and S04"
```

##### `reposition_task`
Reposition a task within a task list — move it before or after another task.

```
"Move task 99 to the top of the list"
"Position task 99 after task 100"
```

##### `move_task_to_list`
Move a task to a different task list within the same project.

```
"Move task 99 to the 'Done' list"
"Transfer task 99 to the Backlog"
```

##### `add_to_backlog`
Add a task to the project backlog. Creates a Backlog task list if one doesn't exist.

```
"Add task 99 to the backlog"
```

##### `create_tasks_batch`
Create multiple tasks at once in a single operation.

```
"Create these 5 tasks in project 12345: ..."
```

---

#### Subtasks

##### `list_subtasks`
List all subtasks (child tasks) of a given parent task.

```
"Show subtasks of task 99"
"What's left under task 99?"
```

---

#### Task Todos / Checklists

##### `list_todos`
List all todo/checklist items for a specific task.

```
"Show the checklist on task 99"
```

##### `create_todo`
Create a new todo/checklist item on a task.

```
"Add 'Write tests' to the checklist on task 99"
```

##### `update_todo`
Rename a todo item or mark it as completed/incomplete.

```
"Mark todo 55 as done"
"Rename todo 55 to 'Write integration tests'"
```

##### `delete_todo`
Delete a todo/checklist item from a task. This action is destructive.

```
"Delete todo 55"
```

---

#### Task Dependencies

##### `list_task_dependencies`
List all dependencies for a task (blocking, waiting_on, related).

```
"What does task 99 depend on?"
"Show blocking relationships for task 99"
```

##### `add_task_dependency`
Add a dependency relationship between two tasks.

Dependency types:
- `blocking` — task_id blocks depends_on
- `waiting_on` — task_id waits on depends_on
- `related` — general relationship

```
"Task 99 is blocking task 100"
"Task 99 is waiting on task 98"
```

---

#### Comments & Attachments

##### `add_task_comment`
Add a comment to a task.

```
"Add comment 'Approved — ready to ship' to task 99"
```

##### `list_attachments`
List file attachments on a task or comment. Returns filenames, types, sizes, and download URLs.

```
"Show attachments on task 99"
"What files are attached to comment 55?"
```

---

#### Boards & Task Lists

##### `list_boards`
List boards in a project.

```
"Show all boards in project 12345"
```

##### `create_board`
Create a new board in a project.

```
"Create a board called 'Sprint 12' in project 12345"
```

##### `list_task_lists`
List task lists within a board.

```
"Show task lists on board 678"
```

##### `create_task_list`
Create a new task list in a board.

```
"Create a task list 'To Do' in board 678"
```

---

#### Workflow Statuses

##### `list_workflow_statuses`
List workflow statuses available in Productive.io. Used to set task status (Not Started=1, Started=2, Closed=3 and any custom statuses).

```
"What workflow statuses are available?"
"Show me all task statuses"
```

---

#### Time Entries

Time entry creation follows a 5-step workflow: **project → deal → service → task → create**.

##### `list_time_entries`
View existing time entries with detailed information including service and budget relationships. Use `"me"` for `person_id` if `PRODUCTIVE_USER_ID` is configured.

Filters: date, date range (after/before), person, project.

```
"Show my time entries for today"
"What did I log last week?"
"Show time entries for project 12345 this month"
```

##### `create_time_entry`
*(Step 5 of timesheet workflow)* Create a time entry. Requires a valid `service_id` from the workflow hierarchy and a detailed work description (minimum 10 characters).

```
"Log 2 hours to service 789 today — worked on API integration"
```

Use the `timesheet` prompt for a guided walk-through.

##### `update_time_entry`
Update an existing time entry. Provide only the fields to change.

```
"Change time entry 123 to 3 hours"
"Update the note on time entry 123"
```

##### `delete_time_entry`
Delete a time entry. This action is irreversible.

```
"Delete time entry 123"
```

##### `list_services`
List all services in the organisation. For timesheet creation, prefer the structured workflow (`list_project_deals` → `list_deal_services`) to get services scoped to the correct project and budget.

```
"What services exist in the org?"
```

##### `list_project_deals`
*(Step 2 of timesheet workflow)* Get deals/budgets for a specific project.

```
"What deals does project 12345 have?"
```

##### `list_deal_services`
*(Step 3 of timesheet workflow)* Get services for a specific deal/budget.

```
"What services are under deal 456?"
```

---

#### Memberships

##### `list_memberships`
List project memberships — see which people are members of a project, or which projects a person belongs to.

```
"Who is a member of project 12345?"
"What projects is person 67890 on?"
```

---

#### Expenses

##### `list_expenses`
List expenses. Filter by person, project, or date range. Use `"me"` for `person_id` if `PRODUCTIVE_USER_ID` is configured.

```
"Show my expenses this month"
"What expenses are logged for project 12345?"
```

##### `create_expense`
Create a new expense record. Can be linked to a project and/or deal/budget.

```
"Log a €45 train expense for project 12345"
```

---

#### Invoices

##### `list_invoices`
List invoices. Filter by company, project, status (1=draft, 2=sent, 3=paid, 4=canceled), and date range.

```
"Show all sent invoices"
"What invoices are outstanding for company 789?"
```

##### `get_invoice`
Get detailed information about a specific invoice.

```
"Show invoice 456 details"
```

---

#### Activity & Pages

##### `list_activities`
List activities (changes/updates) from Productive.io with filtering. Use to track recent work across projects and people.

```
"What changed in project 12345 today?"
"Show recent activity for person 67890"
```

##### `get_recent_updates`
Get a summary of recent updates and changes in the last N days, with a breakdown by item type.

```
"What's changed in the last 7 days?"
"Give me a summary of recent updates"
```

##### `list_pages`
List knowledge base pages in Productive.io. Filter by project to see project-specific documentation.

```
"Show pages for project 12345"
"List all knowledge base pages"
```

##### `get_page`
Get the full content of a specific knowledge base page.

```
"Show the content of page 789"
```

---

#### rb2 Delivery Tools

These tools are extended beyond the core Productive.io API and are tailored for rb2's delivery workflow.

##### `get_budget_burn`
Analyse budget burn for projects. Returns budget value, amount spent, burn %, remaining, and RAG status per budget deal.

- 🟢 Green — under 70% burned
- 🟡 Amber — 70–90% burned
- 🔴 Red — over 90% burned

Use `min_burn_pct` to filter to at-risk projects only.

```
"Show me budget burn for all active projects"
"Which projects are over 80% burned?"
"Show only red and amber projects"
```

##### `get_resource_plan`
View team bookings and utilisation for a date range. Shows bookings with person, project, hours/day, and utilisation %. Use `person_name` and `project_id` for focused planning views.

```
"Show me the resource plan for the next 4 weeks"
"What is Marthin booked on this month?"
"Show capacity for the NL team next sprint"
```

##### `get_overbooked_people`
Detect team members with overlapping bookings exceeding capacity threshold.

```
"Who is overbooked this month?"
"Check for overbooking above 90% capacity next 2 weeks"
```

##### `get_org_overview`
High-level snapshot of active projects and headcount per rb2 subsidiary: NL, SCAPE, Code Blue, CN, PT, NG.

```
"Give me an org overview"
"How many active projects does rb2 NL have?"
"Show headcount per subsidiary"
```

##### `list_bookings`
List raw resource bookings/capacity planning entries. Shows planned work allocation for people on projects over date ranges. Use to check availability and planned capacity. Use `"me"` for `person_id` if `PRODUCTIVE_USER_ID` is configured.

```
"Show all bookings for next week"
"What am I booked on this month?"
```

---

### Prompts (5 total)

Prompts are pre-built workflow templates that guide the AI through multi-step operations. Invoke them by name in Claude Desktop or with `/mcp__productive__<name>` in Claude Code.

#### `timesheet`
Guided workflow for creating timesheet entries. Walks through project → budget → service → task → time entry selection with proper validation. Accepts optional hints to pre-fill the workflow.

Arguments:
- `project` — project name or ID to start with (optional)
- `date` — `today`, `yesterday`, or `YYYY-MM-DD` (optional)
- `time` — duration like `"2h"`, `"120m"`, `"1.5h"` (optional)
- `work_description` — brief description of work performed (optional)

```
"Help me log time for today" → use timesheet prompt
"Log 2 hours to Gadero for yesterday" → timesheet with project=Gadero, date=yesterday, time=2h
```

#### `quick_timesheet`
Step-by-step guidance for a specific stage of the timesheet workflow. Use when you're already partway through and need help with a specific step: `project`, `budget`, `service`, `task`, or `create`.

Arguments:
- `step` — current step: `project`, `budget`, `service`, `task`, or `create`
- `project_id` — project ID if already selected (optional)
- `deal_id` — deal/budget ID if already selected (optional)
- `service_id` — service ID if already selected (optional)
- `task_id` — task ID if already selected (optional)

#### `weekly_report`
Generate a structured weekly status report for a team member: time logged, tasks completed, in-progress work.

Arguments:
- `person_id` — person to report on (leave blank to use the configured user)
- `week_start` — start of the week in `YYYY-MM-DD` format (defaults to current Monday)

```
"Generate my weekly report"
"Weekly report for person 67890, week starting 2025-05-05"
```

#### `project_health`
Full project health check: budget burn, open tasks, team capacity, and recent activity — produces a RAG-rated summary.

Arguments:
- `project_id` — the Productive.io project ID to analyse

```
"Run a health check on project 12345"
"How is project 12345 doing overall?"
```

#### `sprint_planning`
Walk through sprint planning: review backlog, check capacity, select tasks, create new ones, and assign the team.

Arguments:
- `project_id` — the project ID to plan the sprint for
- `sprint_name` — name for the new sprint (e.g. `"Sprint 12"`)

```
"Help me plan Sprint 12 for project 12345"
```

---

### Resources (6 total)

Resources are read-only data sources you can reference directly. In Claude, prefix with `@productive` or use the URI scheme `productive://`.

#### `productive://projects`
All active projects in Productive.io — names, IDs, and status.

#### `productive://org/overview`
rb2 headcount per subsidiary and total active projects.

#### `productive://me/tasks`
Open tasks assigned to the configured user. Requires `PRODUCTIVE_USER_ID`.

#### `productive://me/today`
Time entries logged today by the configured user. Requires `PRODUCTIVE_USER_ID`.

#### `productive://projects/{id}/tasks` *(template)*
Open tasks for a specific project. Replace `{id}` with the project ID.

#### `productive://tasks/{id}` *(template)*
Full details of a specific task. Replace `{id}` with the task ID.

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
