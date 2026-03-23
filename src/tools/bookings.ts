import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

const listBookingsSchema = z.object({
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

function handleError(error: unknown): never {
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
