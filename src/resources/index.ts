import { Config } from '../config/index.js';
import { ProductiveAPIClient } from '../api/client.js';
import { RB2_SUBSIDIARIES } from '../config/rb2.js';

// ─── Static resource definitions ────────────────────────────────────────────

export function listStaticResources(config: Config): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  const resources = [
    {
      uri: 'productive://projects',
      name: 'Active Projects',
      description: 'All active projects in Productive.io',
      mimeType: 'text/plain',
    },
    {
      uri: 'productive://org/overview',
      name: 'Org Overview',
      description: 'rb2 headcount per subsidiary and total active projects',
      mimeType: 'text/plain',
    },
  ];

  if (config.PRODUCTIVE_USER_ID) {
    resources.push(
      {
        uri: 'productive://me/tasks',
        name: 'My Open Tasks',
        description: 'Open tasks assigned to the configured user',
        mimeType: 'text/plain',
      },
      {
        uri: 'productive://me/today',
        name: "Today's Time Entries",
        description: "Time entries logged today by the configured user",
        mimeType: 'text/plain',
      }
    );
  }

  return resources;
}

// ─── Resource templates ───────────────────────────────────────────────────

export function listResourceTemplates(): Array<{
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  return [
    {
      uriTemplate: 'productive://projects/{project_id}/tasks',
      name: 'Project Tasks',
      description: 'Open tasks for a specific project',
      mimeType: 'text/plain',
    },
    {
      uriTemplate: 'productive://tasks/{task_id}',
      name: 'Task Detail',
      description: 'Full details of a specific task',
      mimeType: 'text/plain',
    },
  ];
}

// ─── Resource reader ─────────────────────────────────────────────────────

export async function readResource(
  uri: string,
  client: ProductiveAPIClient,
  config: Config
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const text = await routeResource(uri, client, config);
  return { contents: [{ uri, mimeType: 'text/plain', text }] };
}

async function routeResource(uri: string, client: ProductiveAPIClient, config: Config): Promise<string> {
  if (uri === 'productive://projects') {
    return readProjects(client);
  }
  if (uri === 'productive://org/overview') {
    return readOrgOverview(client);
  }
  if (uri === 'productive://me/tasks') {
    if (!config.PRODUCTIVE_USER_ID) throw new Error('PRODUCTIVE_USER_ID is not configured');
    return readMyTasks(client, config.PRODUCTIVE_USER_ID);
  }
  if (uri === 'productive://me/today') {
    if (!config.PRODUCTIVE_USER_ID) throw new Error('PRODUCTIVE_USER_ID is not configured');
    return readTodayEntries(client, config.PRODUCTIVE_USER_ID);
  }

  const projectTasksMatch = uri.match(/^productive:\/\/projects\/([^/]+)\/tasks$/);
  if (projectTasksMatch) {
    return readProjectTasks(client, projectTasksMatch[1]!);
  }

  const taskMatch = uri.match(/^productive:\/\/tasks\/([^/]+)$/);
  if (taskMatch) {
    return readTask(client, taskMatch[1]!);
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

// ─── Individual readers ───────────────────────────────────────────────────

async function readProjects(client: ProductiveAPIClient): Promise<string> {
  const response = await client.listProjects({ status: 'active', limit: 200 });
  if (!response.data?.length) return 'No active projects found.';

  const lines = [`Active Projects (${response.data.length}):\n`];
  for (const p of response.data) {
    const companyId = p.relationships?.company?.data?.id;
    lines.push(`• ${p.attributes.name} (ID: ${p.id})${companyId ? ` — Company ID: ${companyId}` : ''}`);
  }
  return lines.join('\n');
}

async function readMyTasks(client: ProductiveAPIClient, userId: string): Promise<string> {
  const response = await client.listTasks({ assignee_id: userId, status: 'open', limit: 50 });
  if (!response.data?.length) return 'No open tasks assigned to you.';

  const lines = [`My Open Tasks (${response.data.length}):\n`];
  for (const task of response.data) {
    const projectId = task.relationships?.project?.data?.id;
    lines.push(`• ${task.attributes.title} (ID: ${task.id})${task.attributes.due_date ? ` — Due: ${task.attributes.due_date}` : ''}${projectId ? ` — Project: ${projectId}` : ''}`);
  }
  return lines.join('\n');
}

async function readTodayEntries(client: ProductiveAPIClient, userId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0]!;
  const response = await client.listTimeEntries({ person_id: userId, date: today, limit: 50 });
  if (!response.data?.length) return `No time entries logged today (${today}).`;

  let totalMinutes = 0;
  const lines = [`Today's Time Entries — ${today}:\n`];
  for (const entry of response.data) {
    const mins = entry.attributes.time ?? 0;
    totalMinutes += mins;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const duration = h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`;
    lines.push(`• ${duration}${entry.attributes.note ? ` — ${entry.attributes.note}` : ''} (ID: ${entry.id})`);
  }
  const th = Math.floor(totalMinutes / 60);
  const tm = totalMinutes % 60;
  lines.push(`\nTotal: ${th}h${tm > 0 ? `${tm}m` : ''}`);
  return lines.join('\n');
}

async function readOrgOverview(client: ProductiveAPIClient): Promise<string> {
  const [peopleRaw, projectsResp] = await Promise.all([
    client.getAllPages<any>('people', new URLSearchParams({ include: 'subsidiary' })),
    client.listProjects({ status: 'active', limit: 200 }),
  ]);

  const projects = projectsResp.data ?? [];
  const headcountBySubsidiary: Record<string, number> = {};

  for (const person of peopleRaw) {
    if (person.attributes?.placeholder || person.attributes?.archived_at) continue;
    const subId = person.relationships?.subsidiary?.data?.id;
    if (!subId) continue;
    headcountBySubsidiary[subId] = (headcountBySubsidiary[subId] ?? 0) + 1;
  }

  const totalPeople = Object.values(headcountBySubsidiary).reduce((a, b) => a + b, 0);
  const lines = [`# rb2 Org Overview\n`, `${projects.length} active projects | ${totalPeople} people\n`];

  for (const [subId, subName] of Object.entries(RB2_SUBSIDIARIES)) {
    lines.push(`${subName}: ${headcountBySubsidiary[subId] ?? 0} people`);
  }

  lines.push(`\nActive projects (first 20):`);
  for (const p of projects.slice(0, 20)) {
    lines.push(`• ${p.attributes?.name ?? p.id}`);
  }
  if (projects.length > 20) lines.push(`• … and ${projects.length - 20} more`);

  return lines.join('\n');
}

async function readProjectTasks(client: ProductiveAPIClient, projectId: string): Promise<string> {
  const response = await client.listTasks({ project_id: projectId, status: 'open', limit: 200 });
  if (!response.data?.length) return `No open tasks found for project ${projectId}.`;

  const lines = [`Open Tasks — Project ${projectId} (${response.data.length}):\n`];
  for (const task of response.data) {
    const assigneeId = task.relationships?.assignee?.data?.id;
    lines.push(`• ${task.attributes.title} (ID: ${task.id})${task.attributes.due_date ? ` — Due: ${task.attributes.due_date}` : ''}${assigneeId ? ` — Assignee: ${assigneeId}` : ''}`);
  }
  return lines.join('\n');
}

async function readTask(client: ProductiveAPIClient, taskId: string): Promise<string> {
  const response = await client.getTask(taskId);
  const task = response.data;
  const projectId = task.relationships?.project?.data?.id;
  const assigneeId = task.relationships?.assignee?.data?.id;
  const statusText = task.attributes.closed === false ? 'open' : task.attributes.closed === true ? 'closed' : 'unknown';

  const lines = [
    `Task: ${task.attributes.title} (ID: ${task.id})`,
    `Status: ${statusText}`,
    task.attributes.due_date ? `Due: ${task.attributes.due_date}` : 'No due date',
    projectId ? `Project ID: ${projectId}` : '',
    assigneeId ? `Assignee ID: ${assigneeId}` : 'Unassigned',
    task.attributes.description ? `\nDescription:\n${task.attributes.description}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}
