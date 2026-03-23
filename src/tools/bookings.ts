import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };
const STANDARD_WORKDAY_MINUTES = 8 * 60;

type RelationData = { id: string; type: string };
type JsonApiEntity = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: RelationData | RelationData[] | null }>;
};

type BookingSummary = {
  bookingId: string;
  personId?: string;
  personName: string;
  projectId?: string;
  projectName: string;
  startedOn: string;
  endedOn: string;
  minutesPerDay: number;
  utilisationPct: number;
  note?: string;
};

type OverbookedBookingRef = {
  bookingId: string;
  projectName: string;
};

type OverbookedDay = {
  personId: string;
  personName: string;
  date: string;
  minutes: number;
  bookings: OverbookedBookingRef[];
};

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

const getOverbookedPeopleSchema = z.object({
  after: dateSchema.optional(),
  before: dateSchema.optional(),
  threshold_pct: z.number().min(1).max(300).default(100).optional(),
});

function handleError(error: unknown): never {
  if (error instanceof McpError) {
    throw error;
  }
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatHoursFromMinutes(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? hours.toString() : hours.toFixed(1);
}

function toUtcDate(dateText: string): Date | null {
  const date = new Date(`${dateText}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function getDefaultDateRange(): { after: string; before: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    after: formatDate(today),
    before: formatDate(addDaysUtc(today, 28)),
  };
}

function resolveDateRange(after?: string, before?: string): { after: string; before: string; afterDate: Date; beforeDate: Date } {
  const defaults = getDefaultDateRange();
  const afterValue = after ?? defaults.after;
  const beforeValue = before ?? defaults.before;

  const afterDate = toUtcDate(afterValue);
  const beforeDate = toUtcDate(beforeValue);
  if (!afterDate || !beforeDate) {
    throw new McpError(ErrorCode.InvalidParams, 'Invalid date range. Use YYYY-MM-DD format.');
  }
  if (afterDate.getTime() > beforeDate.getTime()) {
    throw new McpError(ErrorCode.InvalidParams, '"after" must be on or before "before".');
  }

  return { after: afterValue, before: beforeValue, afterDate, beforeDate };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getRelationId(entity: JsonApiEntity | undefined, relationshipName: string): string | undefined {
  const relation = entity?.relationships?.[relationshipName];
  const relationData = relation?.data;
  if (!relationData || Array.isArray(relationData)) {
    return undefined;
  }
  return relationData.id;
}

function buildIncludedLookup(included: JsonApiEntity[]): Record<string, JsonApiEntity> {
  const lookup: Record<string, JsonApiEntity> = {};
  for (const item of included) {
    lookup[`${item.type}:${item.id}`] = item;
  }
  return lookup;
}

function getMinutesPerDay(booking: JsonApiEntity, startDate: Date, endDate: Date): number {
  const directMinutes = asNumber(booking.attributes?.time);
  if (directMinutes !== undefined && directMinutes > 0) {
    return Math.round(directMinutes);
  }

  const bookedTime = asNumber(booking.attributes?.booked_time);
  if (bookedTime !== undefined && bookedTime > 0) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayCount = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);
    return Math.max(1, Math.round(bookedTime / dayCount));
  }

  return 0;
}

function resolvePerson(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): { personId?: string; personName: string } {
  const personId = getRelationId(booking, 'person');
  if (!personId) {
    return { personName: 'Unknown person' };
  }

  const person = includedLookup[`people:${personId}`];
  const firstName = asString(person?.attributes?.first_name);
  const lastName = asString(person?.attributes?.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    personId,
    personName: fullName || `Person ${personId}`,
  };
}

function resolveProject(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): { projectId?: string; projectName: string } {
  const directProjectId = getRelationId(booking, 'project');
  const serviceId = getRelationId(booking, 'service');
  const service = serviceId ? includedLookup[`services:${serviceId}`] : undefined;
  const dealId = getRelationId(service, 'deal');
  const deal = dealId ? includedLookup[`deals:${dealId}`] : undefined;
  const dealProjectId = getRelationId(deal, 'project');
  const projectId = directProjectId ?? dealProjectId;

  if (!projectId) {
    return { projectName: 'Unassigned project' };
  }

  const project = includedLookup[`projects:${projectId}`];
  const projectName = asString(project?.attributes?.name) ?? `Project ${projectId}`;
  return { projectId, projectName };
}

function buildBookingSummary(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): BookingSummary | null {
  const startedOn = asString(booking.attributes?.started_on);
  const endedOn = asString(booking.attributes?.ended_on);
  if (!startedOn || !endedOn) {
    return null;
  }

  const startDate = toUtcDate(startedOn);
  const endDate = toUtcDate(endedOn);
  if (!startDate || !endDate) {
    return null;
  }

  const minutesPerDay = getMinutesPerDay(booking, startDate, endDate);
  const utilisationPct = Math.round((minutesPerDay / STANDARD_WORKDAY_MINUTES) * 100);
  const person = resolvePerson(booking, includedLookup);
  const project = resolveProject(booking, includedLookup);
  const note = asString(booking.attributes?.note);

  return {
    bookingId: booking.id,
    personId: person.personId,
    personName: person.personName,
    projectId: project.projectId,
    projectName: project.projectName,
    startedOn,
    endedOn,
    minutesPerDay,
    utilisationPct,
    note,
  };
}

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

export async function getOverbookedPeopleHandler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<ToolResult> {
  try {
    const params = getOverbookedPeopleSchema.parse(args ?? {});
    const range = resolveDateRange(params.after, params.before);
    const thresholdPct = params.threshold_pct ?? 100;
    const thresholdMinutes = (thresholdPct / 100) * STANDARD_WORKDAY_MINUTES;

    const { bookings, included } = await client.listBookingsWithIncluded({
      after: range.after,
      before: range.before,
    });

    const includedLookup = buildIncludedLookup((included ?? []) as JsonApiEntity[]);
    const dayLoad = new Map<string, OverbookedDay>();

    for (const booking of bookings as JsonApiEntity[]) {
      const summary = buildBookingSummary(booking, includedLookup);
      if (!summary?.personId || summary.minutesPerDay <= 0) {
        continue;
      }

      const bookingStart = toUtcDate(summary.startedOn);
      const bookingEnd = toUtcDate(summary.endedOn);
      if (!bookingStart || !bookingEnd) {
        continue;
      }

      const effectiveStart = bookingStart.getTime() > range.afterDate.getTime() ? bookingStart : range.afterDate;
      const effectiveEnd = bookingEnd.getTime() < range.beforeDate.getTime() ? bookingEnd : range.beforeDate;
      if (effectiveStart.getTime() > effectiveEnd.getTime()) {
        continue;
      }

      for (
        let day = new Date(effectiveStart);
        day.getTime() <= effectiveEnd.getTime();
        day = addDaysUtc(day, 1)
      ) {
        const date = formatDate(day);
        const key = `${summary.personId}:${date}`;
        const existing = dayLoad.get(key);
        if (existing) {
          existing.minutes += summary.minutesPerDay;
          existing.bookings.push({ bookingId: summary.bookingId, projectName: summary.projectName });
        } else {
          dayLoad.set(key, {
            personId: summary.personId,
            personName: summary.personName,
            date,
            minutes: summary.minutesPerDay,
            bookings: [{ bookingId: summary.bookingId, projectName: summary.projectName }],
          });
        }
      }
    }

    const overbookedDays = Array.from(dayLoad.values())
      .filter((entry) => entry.minutes > thresholdMinutes)
      .sort((a, b) => a.personName.localeCompare(b.personName) || a.date.localeCompare(b.date));

    if (overbookedDays.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No overbooked people found for ${range.after} → ${range.before} at ${thresholdPct}% threshold.`,
        }],
      };
    }

    const byPerson = new Map<string, OverbookedDay[]>();
    for (const day of overbookedDays) {
      const existing = byPerson.get(day.personId);
      if (existing) {
        existing.push(day);
      } else {
        byPerson.set(day.personId, [day]);
      }
    }

    const lines: string[] = [];
    lines.push(`# Overbooked People (${range.after} → ${range.before})`);
    lines.push('');
    lines.push(`Threshold: ${thresholdPct}% (${formatHoursFromMinutes(thresholdMinutes)}h/day)`);
    lines.push(`Found ${byPerson.size} overbooked people across ${overbookedDays.length} day(s).`);
    lines.push('');

    for (const personDays of byPerson.values()) {
      const personName = personDays[0]?.personName ?? 'Unknown person';
      const peakMinutes = Math.max(...personDays.map((day) => day.minutes));
      const peakPct = Math.round((peakMinutes / STANDARD_WORKDAY_MINUTES) * 100);

      lines.push(`## ${personName}`);
      lines.push(`- Peak load: ${peakPct}% (${formatHoursFromMinutes(peakMinutes)}h/day)`);
      lines.push(`- Overbooked days: ${personDays.length}`);

      const maxDaysToShow = 10;
      for (const day of personDays.slice(0, maxDaysToShow)) {
        const dayPct = Math.round((day.minutes / STANDARD_WORKDAY_MINUTES) * 100);
        const projects = Array.from(new Set(day.bookings.map((booking) => booking.projectName))).join(', ');
        lines.push(`- ${day.date}: ${dayPct}% (${formatHoursFromMinutes(day.minutes)}h/day) on ${projects}`);
      }

      if (personDays.length > maxDaysToShow) {
        lines.push(`- ... and ${personDays.length - maxDaysToShow} more day(s)`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n').trim() }] };
  } catch (error) {
    handleError(error);
  }
}
