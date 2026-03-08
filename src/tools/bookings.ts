import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';

const getResourcePlanSchema = z.object({
  after: z.string().optional().describe('Start date YYYY-MM-DD (default: today)'),
  before: z.string().optional().describe('End date YYYY-MM-DD (default: +4 weeks)'),
  person_name: z.string().optional().describe('Filter by person name (partial match)'),
  project_id: z.string().optional().describe('Filter by project ID'),
});

const getOverbookedSchema = z.object({
  after: z.string().optional().describe('Start date YYYY-MM-DD (default: today)'),
  before: z.string().optional().describe('End date YYYY-MM-DD (default: +4 weeks)'),
  threshold_pct: z.number().min(1).max(200).default(100).optional().describe('Overbooking threshold in % (default: 100)'),
});

export const getResourcePlanTool = {
  name: 'get_resource_plan',
  description: 'Get the rb2 resource plan — team bookings and utilization for a date range. Shows who is booked, on what project, for how many hours/day, and their utilization %. Use to check capacity before adding work.',
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
      before: { type: 'string', description: 'End date YYYY-MM-DD (default: +4 weeks)' },
      person_name: { type: 'string', description: 'Filter by person name (partial match, case-insensitive)' },
      project_id: { type: 'string', description: 'Filter by project ID' },
    },
  },
};

export const getOverbookedPeopleTool = {
  name: 'get_overbooked_people',
  description: 'Detect rb2 team members who are overbooked (multiple overlapping bookings exceeding capacity threshold). Returns each overbooked person with their total hours/day and which bookings conflict.',
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
      before: { type: 'string', description: 'End date YYYY-MM-DD (default: +4 weeks)' },
      threshold_pct: { type: 'number', description: 'Overbooking threshold % (default: 100 = fully booked)', default: 100 },
    },
  },
};

function defaultDateRange(): { after: string; before: string } {
  const today = new Date();
  const fourWeeks = new Date(today);
  fourWeeks.setDate(today.getDate() + 28);
  return {
    after: today.toISOString().split('T')[0],
    before: fourWeeks.toISOString().split('T')[0],
  };
}

export async function getResourcePlanHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const params = getResourcePlanSchema.parse(args ?? {});
  const { after, before } = defaultDateRange();

  try {
    const bookings = await client.listBookings({
      after: params.after ?? after,
      before: params.before ?? before,
      person_id: undefined,
      project_id: params.project_id,
    });

    if (bookings.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found for the given period.' }] };
    }

    // Group by person
    const byPerson: Record<string, any[]> = {};
    for (const b of bookings) {
      const rel = b.relationships ?? {};
      const personId = rel.person?.data?.id ?? 'unknown';
      const included = (b as any)._included ?? {};
      const personName = included[`people:${personId}`]?.attributes?.first_name
        ? `${included[`people:${personId}`].attributes.first_name} ${included[`people:${personId}`].attributes.last_name ?? ''}`.trim()
        : personId;

      const attr = b.attributes ?? {};
      const name = attr.person_name ?? personName;

      // Filter by name if requested
      if (params.person_name && !name.toLowerCase().includes(params.person_name.toLowerCase())) continue;

      if (!byPerson[name]) byPerson[name] = [];
      byPerson[name].push(b);
    }

    const lines: string[] = [`# Resource Plan: ${params.after ?? after} → ${params.before ?? before}\n`];
    lines.push(`**${Object.keys(byPerson).length} people booked | ${bookings.length} total bookings**\n`);

    for (const [person, bks] of Object.entries(byPerson).sort()) {
      lines.push(`## 👤 ${person}`);
      for (const bk of bks) {
        const attr = bk.attributes ?? {};
        const hpd = attr.hours_per_day ?? (attr.allocated_hours ? (attr.allocated_hours / 5) : '?');
        const pct = typeof hpd === 'number' ? Math.round((hpd / 8) * 100) : '?';
        const projectId = bk.relationships?.project?.data?.id ?? '?';
        const projectName = attr.project_name ?? `Project ${projectId}`;
        const stage = attr.booking_type === 1 ? 'tentative' : attr.booking_type === 2 ? 'confirmed' : 'draft';
        lines.push(`  - **${projectName}** | ${attr.started_on} → ${attr.ended_on} | ${hpd}h/day (${pct}%) | ${stage}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching resource plan: ${err.message}` }] };
  }
}

export async function getOverbookedPeopleHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const params = getOverbookedSchema.parse(args ?? {});
  const { after, before } = defaultDateRange();
  const threshold = params.threshold_pct ?? 100;

  try {
    const bookings = await client.listBookings({
      after: params.after ?? after,
      before: params.before ?? before,
    });

    if (bookings.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found for the given period.' }] };
    }

    // Group by person
    const byPerson: Record<string, any[]> = {};
    for (const b of bookings) {
      const attr = b.attributes ?? {};
      const name = attr.person_name ?? b.relationships?.person?.data?.id ?? 'unknown';
      if (!byPerson[name]) byPerson[name] = [];
      byPerson[name].push(b);
    }

    const overbooked: Array<{ person: string; hpd: number; pct: number; bookings: any[] }> = [];

    for (const [person, bks] of Object.entries(byPerson)) {
      // Find overlapping booking pairs
      for (let i = 0; i < bks.length; i++) {
        const b1 = bks[i];
        const overlapping = bks.filter(b2 => {
          const s1 = b1.attributes?.started_on ?? '';
          const e1 = b1.attributes?.ended_on ?? '';
          const s2 = b2.attributes?.started_on ?? '';
          const e2 = b2.attributes?.ended_on ?? '';
          return s1 <= e2 && e1 >= s2;
        });
        if (overlapping.length > 1) {
          const totalHpd = overlapping.reduce((sum: number, b: any) => sum + (b.attributes?.hours_per_day ?? 0), 0);
          const pct = Math.round((totalHpd / 8) * 100);
          if (pct > threshold) {
            // Only add once per person
            if (!overbooked.find(o => o.person === person)) {
              overbooked.push({ person, hpd: Math.round(totalHpd * 10) / 10, pct, bookings: overlapping });
            }
          }
          break;
        }
      }
    }

    if (overbooked.length === 0) {
      return { content: [{ type: 'text', text: `✅ No overbooking detected above ${threshold}% threshold in the given period.` }] };
    }

    const lines: string[] = [`# ⚠️ Overbooked People (>${threshold}% capacity)\n`];
    lines.push(`**${overbooked.length} people overbooked | ${params.after ?? after} → ${params.before ?? before}**\n`);

    for (const { person, hpd, pct, bookings: bks } of overbooked.sort((a, b) => b.pct - a.pct)) {
      lines.push(`## 🔴 ${person} — ${hpd}h/day (${pct}%)`);
      for (const bk of bks) {
        const attr = bk.attributes ?? {};
        lines.push(`  - ${attr.project_name ?? 'Unknown project'}: ${attr.started_on} → ${attr.ended_on} @ ${attr.hours_per_day ?? '?'}h/day`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error detecting overbooking: ${err.message}` }] };
  }
}
