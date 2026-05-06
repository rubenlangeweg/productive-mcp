import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  type ToolResult,
  type JsonApiEntity,
  type BookingSummary,
  handleError,
  formatMinutes,
  formatHoursFromMinutes,
  buildIncludedLookup,
  buildBookingSummary,
  resolveDateRange,
} from './_bookings-helpers.js';

export { getOverbookedPeopleHandler } from './bookings-overbooked.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const listBookingsSchema = z.object({
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  after: dateSchema.optional(),
  before: dateSchema.optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const getResourcePlanSchema = z.object({
  after: dateSchema.optional(),
  before: dateSchema.optional(),
  person_name: z.string().min(1).optional(),
  project_id: z.string().optional(),
});

export async function listBookingsTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<ToolResult> {
  try {
    const params = listBookingsSchema.parse(args || {});

    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(ErrorCode.InvalidParams, 'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured');
      }
      personId = config.PRODUCTIVE_USER_ID;
    }

    const response = await client.listBookings({
      person_id: personId,
      project_id: params.project_id,
      after: params.after,
      before: params.before,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      return { content: [{ type: 'text', text: 'No bookings found matching the criteria.' }] };
    }

    const bookingsText = response.data.map(booking => {
      const bookingPersonId = booking.relationships?.person?.data?.id;
      const bookingProjectId = booking.relationships?.project?.data?.id;
      const timePerDay = formatMinutes(booking.attributes.time as number | undefined);
      const totalBooked = formatMinutes(booking.attributes.booked_time as number | undefined);
      return `• Booking (ID: ${booking.id})
  Period: ${booking.attributes.started_on} → ${booking.attributes.ended_on}
  Time per day: ${timePerDay}
  ${booking.attributes.booked_time !== undefined ? `Total booked: ${totalBooked}` : ''}
  ${booking.attributes.note ? `Note: ${booking.attributes.note}` : ''}
  ${bookingPersonId ? `Person ID: ${bookingPersonId}` : ''}
  ${bookingProjectId ? `Project ID: ${bookingProjectId}` : ''}`.trim();
    }).join('\n\n');

    const total = response.meta?.total_count;
    const summary = `Found ${response.data.length} booking${response.data.length !== 1 ? 's' : ''}${total ? ` (showing ${response.data.length} of ${total})` : ''}:\n\n${bookingsText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export const listBookingsDefinition = {
  name: 'list_bookings',
  description: 'List resource bookings/capacity planning entries in Productive.io. Bookings show planned work allocation for people on projects over date ranges. Use to check availability and planned capacity. Use "me" for person_id if PRODUCTIVE_USER_ID is configured.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'string', description: 'Filter by person ID. Use "me" for the configured user.' },
      project_id: { type: 'string', description: 'Filter by project ID' },
      after: { type: 'string', description: 'Filter bookings starting after this date (YYYY-MM-DD)' },
      before: { type: 'string', description: 'Filter bookings starting before this date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};

export const getResourcePlanTool = {
  name: 'get_resource_plan',
  description: 'Get the rb2 resource plan for a date range. Shows bookings with person, project, hours/day, and utilisation %. Use person_name and project_id for focused planning views.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date (YYYY-MM-DD). Defaults to today.' },
      before: { type: 'string', description: 'End date (YYYY-MM-DD). Defaults to today + 4 weeks.' },
      person_name: { type: 'string', description: 'Filter by person name (case-insensitive partial match).' },
      project_id: { type: 'string', description: 'Filter by project ID.' },
    },
  },
};

export const getOverbookedPeopleTool = {
  name: 'get_overbooked_people',
  description: 'Detect people with overlapping bookings above a utilisation threshold in a date range. Calculates daily load and highlights over-capacity dates.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      after: { type: 'string', description: 'Start date (YYYY-MM-DD). Defaults to today.' },
      before: { type: 'string', description: 'End date (YYYY-MM-DD). Defaults to today + 4 weeks.' },
      threshold_pct: { type: 'number', description: 'Overbooking threshold in percent (default: 100).', default: 100 },
    },
  },
};

export async function getResourcePlanHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = getResourcePlanSchema.parse(args ?? {});
    const range = resolveDateRange(params.after, params.before);
    const { bookings, included } = await client.listBookingsWithIncluded({
      after: range.after,
      before: range.before,
    });

    const includedLookup = buildIncludedLookup((included ?? []) as JsonApiEntity[]);
    const personFilter = params.person_name?.trim().toLowerCase();
    const summaries = (bookings as JsonApiEntity[])
      .map((booking) => buildBookingSummary(booking, includedLookup))
      .filter((summary): summary is BookingSummary => summary !== null)
      .filter((summary) => {
        if (params.project_id && summary.projectId !== params.project_id) {
          return false;
        }
        if (personFilter && !summary.personName.toLowerCase().includes(personFilter)) {
          return false;
        }
        return true;
      });

    if (summaries.length === 0) {
      return { content: [{ type: 'text', text: `No bookings found for ${range.after} → ${range.before}.` }] };
    }

    summaries.sort((a, b) => a.personName.localeCompare(b.personName) || a.startedOn.localeCompare(b.startedOn));

    const byPerson = new Map<string, BookingSummary[]>();
    for (const summary of summaries) {
      const key = summary.personId ?? summary.personName;
      const existing = byPerson.get(key);
      if (existing) {
        existing.push(summary);
      } else {
        byPerson.set(key, [summary]);
      }
    }

    const lines: string[] = [];
    lines.push(`# Resource Plan (${range.after} → ${range.before})`);
    lines.push('');
    lines.push(`Found ${summaries.length} booking${summaries.length === 1 ? '' : 's'} across ${byPerson.size} people.`);
    if (params.person_name) lines.push(`Filter person_name: "${params.person_name}"`);
    if (params.project_id) lines.push(`Filter project_id: ${params.project_id}`);
    lines.push('');

    for (const personBookings of byPerson.values()) {
      const personName = personBookings[0]?.personName ?? 'Unknown person';
      lines.push(`## ${personName}`);

      for (const booking of personBookings) {
        const projectLabel = booking.projectId ? `${booking.projectName} (${booking.projectId})` : booking.projectName;
        const noteSuffix = booking.note ? ` | Note: ${booking.note}` : '';
        lines.push(
          `- ${booking.startedOn} → ${booking.endedOn} | ${projectLabel} | ${formatHoursFromMinutes(booking.minutesPerDay)}h/day (${booking.utilisationPct}%)${noteSuffix}`
        );
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n').trim() }] };
  } catch (error) {
    handleError(error);
  }
}
