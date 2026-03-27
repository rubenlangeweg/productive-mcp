import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { RB2_SUBSIDIARIES } from '../config/rb2.js';

const getOrgOverviewSchema = z.object({});

export const getOrgOverviewTool = {
  name: 'get_org_overview',
  description: `Get an rb2 org-level overview: headcount per subsidiary (NL, SCAPE, Code Blue, CN, PT, NG) plus total active projects. Shows who works where across the organisation.`,
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function getOrgOverviewHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  _getOrgOverviewSchema.parse(args ?? {});

  try {
    // Fetch people with subsidiary included, and projects in parallel
    const [peopleRaw, projectsResp] = await Promise.all([
      client.getAllPages<any>('people', new URLSearchParams({ include: 'subsidiary' })),
      client.listProjects({ status: 'active', limit: 200 }),
    ]);

    const projects = projectsResp.data ?? [];

    // Build subsidiary name map from included data (from last response — we need it from raw fetch)
    // Use RB2_SUBSIDIARIES as the source of truth for names
    const headcountBySubsidiary: Record<string, number> = {};
    const namesBySubsidiary: Record<string, string[]> = {};

    for (const person of peopleRaw) {
      const subId = person.relationships?.subsidiary?.data?.id;
      if (!subId) continue;
      headcountBySubsidiary[subId] = (headcountBySubsidiary[subId] ?? 0) + 1;
      if (!namesBySubsidiary[subId]) namesBySubsidiary[subId] = [];
      const name = `${person.attributes?.first_name ?? ''} ${person.attributes?.last_name ?? ''}`.trim();
      if (!person.attributes?.placeholder && !person.attributes?.archived_at) {
        namesBySubsidiary[subId].push(name);
      }
    }

    const lines: string[] = ['# rb2 Org Overview\n'];
    const totalPeople = Object.values(headcountBySubsidiary).reduce((a, b) => a + b, 0);
    lines.push(`**${projects.length} active projects | ${totalPeople} people (across subsidiaries)**\n`);

    for (const [subId, subName] of Object.entries(RB2_SUBSIDIARIES)) {
      const count = headcountBySubsidiary[subId] ?? 0;
      lines.push(`## 🏢 ${subName}`);
      lines.push(`- Headcount: ${count}`);
      lines.push('');
    }

    lines.push('---');
    lines.push(`## 📂 Active Projects (${projects.length} total)`);
    for (const p of projects.slice(0, 20)) {
      lines.push(`- ${p.attributes?.name ?? p.id}`);
    }
    if (projects.length > 20) lines.push(`- … and ${projects.length - 20} more`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching org overview: ${err.message}` }] };
  }
}

// keep schema reference consistent
const _getOrgOverviewSchema = getOrgOverviewSchema;
