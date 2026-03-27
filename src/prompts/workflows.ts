import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const weeklyReportSchema = z.object({
  person_id: z.string().optional().describe('Person ID to report on (omit to use configured user)'),
  week_start: z.string().optional().describe('Start of week in YYYY-MM-DD format (defaults to current Monday)'),
});

const projectHealthSchema = z.object({
  project_id: z.string().describe('The Productive.io project ID to analyse'),
});

const sprintPlanningSchema = z.object({
  project_id: z.string().describe('The project ID to plan a sprint for'),
  sprint_name: z.string().optional().describe('Name for the new sprint (e.g. "Sprint 12")'),
});

// ─── Weekly Report ────────────────────────────────────────────────────────────

export async function generateWeeklyReportPrompt(args: unknown): Promise<{
  description: string;
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
}> {
  const params = weeklyReportSchema.parse(args ?? {});
  const personRef = params.person_id ?? 'me';
  const weekRef = params.week_start ? `the week starting ${params.week_start}` : 'this week';

  return {
    description: 'Generate a structured weekly status report for a team member',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a weekly status report for ${personRef === 'me' ? 'me' : `person ID ${personRef}`} covering ${weekRef}.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll generate your weekly report in 4 steps:

**Step 1 — Time logged**
Call \`list_time_entries\` with \`person_id: "${personRef}"\`${params.week_start ? ` and date range starting ${params.week_start}` : ' for this week'} to see what time was tracked and against which projects.

**Step 2 — Tasks completed**
Call \`list_activities\` filtered by the same person and date range, looking for task \`close\` events to see what got done.

**Step 3 — Tasks in progress**
Call \`my_tasks\` (or \`list_tasks\` with assignee) to show what's currently open and in flight.

**Step 4 — Compile the report**
Format a clean summary with:
- Total hours logged this week
- Work completed (closed tasks)
- Work in progress (open tasks)
- Notable comments or blockers
- Time breakdown by project

Let me start with Step 1.`,
        },
      },
    ],
  };
}

export const weeklyReportPromptDefinition = {
  name: 'weekly_report',
  description: 'Generate a structured weekly status report — time logged, tasks completed, in-progress work',
  arguments: [
    {
      name: 'person_id',
      description: 'Person ID to report on (leave blank to use the configured user)',
      required: false,
    },
    {
      name: 'week_start',
      description: 'Start of the week in YYYY-MM-DD format (defaults to current Monday)',
      required: false,
    },
  ],
};

// ─── Project Health ───────────────────────────────────────────────────────────

export async function generateProjectHealthPrompt(args: unknown): Promise<{
  description: string;
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
}> {
  const params = projectHealthSchema.parse(args);

  return {
    description: `Full health check for project ${params.project_id}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Run a full health check on project ${params.project_id}.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll run a comprehensive health check on project ${params.project_id} across 4 dimensions:

**Step 1 — Budget burn**
Call \`get_budget_burn\` with \`project_id: "${params.project_id}"\` to see how much budget has been consumed and the RAG status (green/yellow/red).

**Step 2 — Open tasks**
Call \`get_project_tasks\` with \`project_id: "${params.project_id}"\` and \`status: "open"\` to see workload and any overdue items.

**Step 3 — Team capacity**
Call \`get_resource_plan\` to check if team members assigned to this project are over- or under-booked.

**Step 4 — Recent activity**
Call \`list_activities\` with \`project_id: "${params.project_id}"\` for the last 7 days to surface blockers, status changes, or stalled work.

**Step 5 — Health summary**
Compile a RAG-rated (🟢/🟡/🔴) report covering:
- Budget: % spent vs total
- Delivery: overdue tasks vs on-track
- Capacity: team utilisation
- Activity: pace of progress

Starting with Step 1.`,
        },
      },
    ],
  };
}

export const projectHealthPromptDefinition = {
  name: 'project_health',
  description: 'Full project health check: budget burn, open tasks, team capacity, and recent activity — produces a RAG-rated summary',
  arguments: [
    {
      name: 'project_id',
      description: 'The Productive.io project ID to analyse',
      required: true,
    },
  ],
};

// ─── Sprint Planning ──────────────────────────────────────────────────────────

export async function generateSprintPlanningPrompt(args: unknown): Promise<{
  description: string;
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
}> {
  const params = sprintPlanningSchema.parse(args);
  const sprintLabel = params.sprint_name ? `"${params.sprint_name}"` : 'a new sprint';

  return {
    description: `Sprint planning workflow for project ${params.project_id}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me plan ${sprintLabel} for project ${params.project_id}.`,
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `I'll guide you through planning ${sprintLabel} for project ${params.project_id} in 5 steps:

**Step 1 — Review the backlog**
Call \`get_project_tasks\` with \`project_id: "${params.project_id}"\` and \`status: "open"\` to see all available tasks. I'll identify:
- Tasks with due dates (time-sensitive)
- Unassigned tasks (need owners)
- Tasks with dependencies (need to sequence)

**Step 2 — Check team capacity**
Call \`get_resource_plan\` to understand availability for the sprint period. This prevents overbooking.

**Step 3 — Select sprint tasks**
Together we'll choose which backlog tasks fit in the sprint based on priority and capacity.

**Step 4 — Create any missing tasks**
Use \`create_task\` (or \`create_tasks_batch\` for multiple) to add new tasks that belong in this sprint.

**Step 5 — Assign and confirm**
Use \`update_task_assignment\` to assign each sprint task to the right person.${params.sprint_name ? `\n\nSprint name: **${params.sprint_name}**` : ''}

Let me start by reviewing the backlog.`,
        },
      },
    ],
  };
}

export const sprintPlanningPromptDefinition = {
  name: 'sprint_planning',
  description: 'Walk through sprint planning: review backlog, check capacity, select tasks, create new ones, and assign the team',
  arguments: [
    {
      name: 'project_id',
      description: 'The Productive.io project ID to plan the sprint for',
      required: true,
    },
    {
      name: 'sprint_name',
      description: 'Name for the new sprint (e.g. "Sprint 12")',
      required: false,
    },
  ],
};
