import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import {
  type ToolResult,
  type JsonApiEntity,
  type OverbookedDay,
  STANDARD_WORKDAY_MINUTES,
  handleError,
  formatHoursFromMinutes,
  toUtcDate,
  addDaysUtc,
  formatDate,
  buildIncludedLookup,
  buildBookingSummary,
  resolveDateRange,
} from './_bookings-helpers.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const getOverbookedPeopleSchema = z.object({
  after: dateSchema.optional(),
  before: dateSchema.optional(),
  threshold_pct: z.number().min(1).max(300).default(100).optional(),
});

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
