/**
 * Shared types, constants, and helper functions used by bookings.ts and
 * bookings-overbooked.ts. Not exported from the package; prefixed _ by
 * convention to signal "internal module."
 */
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export type ToolResult = { content: Array<{ type: string; text: string }> };
export const STANDARD_WORKDAY_MINUTES = 8 * 60;

export type RelationData = { id: string; type: string };
export type JsonApiEntity = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: RelationData | RelationData[] | null }>;
};

export type BookingSummary = {
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

export type OverbookedBookingRef = {
  bookingId: string;
  projectName: string;
};

export type OverbookedDay = {
  personId: string;
  personName: string;
  date: string;
  minutes: number;
  bookings: OverbookedBookingRef[];
};

export function handleError(error: unknown): never {
  if (error instanceof McpError) {
    throw error;
  }
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatHoursFromMinutes(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? hours.toString() : hours.toFixed(1);
}

export function toUtcDate(dateText: string): Date | null {
  const date = new Date(`${dateText}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function getDefaultDateRange(): { after: string; before: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    after: formatDate(today),
    before: formatDate(addDaysUtc(today, 28)),
  };
}

export function resolveDateRange(after?: string, before?: string): { after: string; before: string; afterDate: Date; beforeDate: Date } {
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

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getRelationId(entity: JsonApiEntity | undefined, relationshipName: string): string | undefined {
  const relation = entity?.relationships?.[relationshipName];
  const relationData = relation?.data;
  if (!relationData || Array.isArray(relationData)) {
    return undefined;
  }
  return relationData.id;
}

export function buildIncludedLookup(included: JsonApiEntity[]): Record<string, JsonApiEntity> {
  const lookup: Record<string, JsonApiEntity> = {};
  for (const item of included) {
    lookup[`${item.type}:${item.id}`] = item;
  }
  return lookup;
}

export function getMinutesPerDay(booking: JsonApiEntity, startDate: Date, endDate: Date): number {
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

export function resolvePerson(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): { personId?: string; personName: string } {
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

export function resolveProject(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): { projectId?: string; projectName: string } {
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

export function buildBookingSummary(booking: JsonApiEntity, includedLookup: Record<string, JsonApiEntity>): BookingSummary | null {
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
