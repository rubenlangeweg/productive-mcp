import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { RB2_SUBSIDIARIES } from '../config/rb2.js';

const getOrgOverviewSchema = z.object({
  after: z.string().optional().describe('Start date YYYY-MM-DD for time entries'),
  before: z.string().optional().describe('End date YYYY-MM-DD for time entries'),
});

export const getOrgOverviewTool = {
  name: 'get_org_overview',
  description: `Get an rb2 org-level overview: active projects and people per subsidiary (NL, SCAPE, Code Blue, CN, PT, NG). Provides a high-level snapshot of where work is happening across the organisation.`,
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Optional start date filter for time entries YYYY-MM-DD' },
      before: { type: 'string', description: 'Optional end date filter for time entries YYYY-MM-DD' },
    },
  },
};

export async function getOrgOverviewHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const _params = getOrgOverviewSchema.parse(args ?? {});

  try {
    // Fetch all active projects and all people in parallel
    const [projectsResp, peopleResp] = await Promise.all([
      client.listProjects({ status: 'active', limit: 200 }),
      client.listAllPeople(),
    ]);

    const projects = projectsResp.data ?? [];
    const people = peopleResp ?? [];

    const lines: string[] = ['# rb2 Org Overview\n'];
    lines.push(`**${projects.length} active projects | ${people.length} people**\n`);

    // Group people by subsidiary (company_id)
    const peopleBySubsidiary: Record<string, number> = {};
    for (const p of people) {
      const compId = p.relationships?.company?.data?.id ?? 'unknown';
      peopleBySubsidiary[compId] = (peopleBySubsidiary[compId] ?? 0) + 1;
    }

    // Group projects by company_id
    const projectsBySubsidiary: Record<string, any[]> = {};
    for (const proj of projects) {
      const compId = proj.relationships?.company?.data?.id ?? 'unknown';
      if (!projectsBySubsidiary[compId]) projectsBySubsidiary[compId] = [];
      projectsBySubsidiary[compId].push(proj);
    }

    // Output per subsidiary
    for (const [subId, subName] of Object.entries(RB2_SUBSIDIARIES)) {
      const subProjects = projectsBySubsidiary[subId] ?? [];
      const subPeople = peopleBySubsidiary[subId] ?? 0;
      lines.push(`## 🏢 ${subName}`);
      lines.push(`- People: ${subPeople}`);
      lines.push(`- Active projects: ${subProjects.length}`);
      if (subProjects.length > 0) {
        subProjects.slice(0, 10).forEach((p: any) => {
          lines.push(`  - ${p.attributes?.name ?? p.id}`);
        });
        if (subProjects.length > 10) lines.push(`  - … and ${subProjects.length - 10} more`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching org overview: ${err.message}` }] };
  }
}
