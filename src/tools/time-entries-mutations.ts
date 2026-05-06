import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveTimeEntryUpdate } from '../api/types.js';

// ─── Update Time Entry ──────────────────────────────────────────────────────

const updateTimeEntrySchema = z.object({
  time_entry_id: z.string().min(1, 'Time entry ID is required'),
  date: z.string().optional(),
  time: z.string().optional(),
  note: z.string().optional(),
  billable_time: z.string().optional(),
  service_id: z.string().optional(),
  task_id: z.string().nullable().optional(),
});

export async function updateTimeEntryTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = updateTimeEntrySchema.parse(args);

    const attributes: ProductiveTimeEntryUpdate['data']['attributes'] = {};
    if (params.date) attributes.date = params.date;
    if (params.time) {
      // Reuse parseTimeToMinutes helper inline
      const input = params.time.toLowerCase().trim();
      const hourMatch = input.match(/^(\d*\.?\d+)\s*h(?:ours?)?$/);
      const minuteMatch = input.match(/^(\d+)\s*m(?:inutes?)?$/);
      const decimalMatch = input.match(/^(\d*\.?\d+)$/);
      if (hourMatch) {
        attributes.time = Math.round(parseFloat(hourMatch[1]) * 60);
      } else if (minuteMatch) {
        attributes.time = parseInt(minuteMatch[1], 10);
      } else if (decimalMatch) {
        attributes.time = Math.round(parseFloat(decimalMatch[1]) * 60);
      } else {
        throw new McpError(ErrorCode.InvalidParams, `Invalid time format: ${params.time}. Use formats like "2h", "120m", or "2.5"`);
      }
    }
    if (params.billable_time) {
      const input = params.billable_time.toLowerCase().trim();
      const hourMatch = input.match(/^(\d*\.?\d+)\s*h(?:ours?)?$/);
      const minuteMatch = input.match(/^(\d+)\s*m(?:inutes?)?$/);
      const decimalMatch = input.match(/^(\d*\.?\d+)$/);
      if (hourMatch) {
        attributes.billable_time = Math.round(parseFloat(hourMatch[1]) * 60);
      } else if (minuteMatch) {
        attributes.billable_time = parseInt(minuteMatch[1], 10);
      } else if (decimalMatch) {
        attributes.billable_time = Math.round(parseFloat(decimalMatch[1]) * 60);
      }
    }
    if (params.note !== undefined) attributes.note = params.note;

    const updateData: ProductiveTimeEntryUpdate = {
      data: {
        type: 'time_entries',
        id: params.time_entry_id,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      },
    };

    if (params.service_id) {
      updateData.data.relationships = {
        ...updateData.data.relationships,
        service: { data: { id: params.service_id, type: 'services' } },
      };
    }
    if (params.task_id !== undefined) {
      updateData.data.relationships = {
        ...updateData.data.relationships,
        task: { data: params.task_id ? { id: params.task_id, type: 'tasks' } : null },
      };
    }

    const response = await client.updateTimeEntry(params.time_entry_id, updateData);
    const entry = response.data;
    const hours = Math.floor(entry.attributes.time / 60);
    const minutes = entry.attributes.time % 60;
    const timeDisplay = hours > 0 ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;

    let text = `Time entry updated successfully!\n`;
    text += `ID: ${entry.id}\n`;
    text += `Date: ${entry.attributes.date}\n`;
    text += `Time: ${timeDisplay}\n`;
    if (entry.attributes.note) text += `Note: ${entry.attributes.note}\n`;
    if (entry.attributes.updated_at) text += `Updated at: ${entry.attributes.updated_at}\n`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const updateTimeEntryDefinition = {
  name: 'update_time_entry',
  description: 'Update an existing time entry in Productive.io. Only provide the fields you want to change.',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      time_entry_id: { type: 'string', description: 'ID of the time entry to update (required)' },
      date: { type: 'string', description: 'New date (YYYY-MM-DD)' },
      time: { type: 'string', description: 'New duration (e.g. "2h", "90m", "1.5")' },
      billable_time: { type: 'string', description: 'New billable duration (same format as time)' },
      note: { type: 'string', description: 'New work description (use empty string to clear)' },
      service_id: { type: 'string', description: 'New service ID' },
      task_id: { type: ['string', 'null'], description: 'New task ID, or null to unlink from task' },
    },
    required: ['time_entry_id'],
  },
};

// ─── Delete Time Entry ──────────────────────────────────────────────────────

const deleteTimeEntrySchema = z.object({
  time_entry_id: z.string().min(1, 'Time entry ID is required'),
});

export async function deleteTimeEntryTool(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const params = deleteTimeEntrySchema.parse(args);
    await client.deleteTimeEntry(params.time_entry_id);
    return {
      content: [{ type: 'text', text: `Time entry ${params.time_entry_id} deleted successfully.` }],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

export const deleteTimeEntryDefinition = {
  name: 'delete_time_entry',
  description: 'Delete a time entry from Productive.io. This action is irreversible.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      time_entry_id: { type: 'string', description: 'ID of the time entry to delete (required)' },
    },
    required: ['time_entry_id'],
  },
};
