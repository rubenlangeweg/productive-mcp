import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ProductiveExpenseCreate } from '../api/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

const listExpensesSchema = z.object({
  person_id: z.string().optional(),
  project_id: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const createExpenseSchema = z.object({
  name: z.string().min(1, 'Expense name is required'),
  date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().min(1, 'Currency is required (e.g. EUR, USD)'),
  service_id: z.string().min(1, 'Service ID is required — use get_project_services to find valid IDs'),
  person_id: z.string().min(1, 'Person ID is required'),
  note: z.string().optional(),
  billable: z.boolean().optional().default(false),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

export async function listExpensesTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<ToolResult> {
  try {
    const params = listExpensesSchema.parse(args || {});

    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(ErrorCode.InvalidParams, 'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured');
      }
      personId = config.PRODUCTIVE_USER_ID;
    }

    const response = await client.listExpenses({
      person_id: personId,
      project_id: params.project_id,
      after: params.after,
      before: params.before,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      return { content: [{ type: 'text', text: 'No expenses found matching the criteria.' }] };
    }

    const expensesText = response.data.map(expense => {
      const personId = expense.relationships?.person?.data?.id;
      const projectId = expense.relationships?.project?.data?.id;
      const billable = expense.attributes.billable ? 'billable' : 'non-billable';
      const approved = expense.attributes.approved ? ' (approved)' : '';
      return `• Expense (ID: ${expense.id})
  Date: ${expense.attributes.date}
  Amount: ${expense.attributes.amount}${expense.attributes.currency ? ` ${expense.attributes.currency}` : ''}
  Type: ${billable}${approved}
  ${expense.attributes.note ? `Note: ${expense.attributes.note}` : 'No note'}
  ${personId ? `Person ID: ${personId}` : ''}
  ${projectId ? `Project ID: ${projectId}` : ''}`.trim();
    }).join('\n\n');

    const totalAmount = response.data.reduce((sum, e) => sum + (e.attributes.amount ?? 0), 0);
    const total = response.meta?.total_count;
    const summary = `Found ${response.data.length} expense${response.data.length !== 1 ? 's' : ''}${total ? ` (showing ${response.data.length} of ${total})` : ''}\nTotal amount: ${totalAmount}\n\n${expensesText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export async function createExpenseTool(
  client: ProductiveAPIClient,
  args: unknown,
  config?: { PRODUCTIVE_USER_ID?: string }
): Promise<ToolResult> {
  try {
    const params = createExpenseSchema.parse(args);

    let personId = params.person_id;
    if (personId === 'me') {
      if (!config?.PRODUCTIVE_USER_ID) {
        throw new McpError(ErrorCode.InvalidParams, 'Cannot use "me" reference - PRODUCTIVE_USER_ID is not configured');
      }
      personId = config.PRODUCTIVE_USER_ID;
    }

    const expenseData: ProductiveExpenseCreate = {
      data: {
        type: 'expenses',
        attributes: {
          name: params.name,
          date: params.date,
          amount: params.amount,
          currency: params.currency,
          note: params.note,
          billable: params.billable,
          person_id: parseInt(personId, 10),
          service_id: parseInt(params.service_id, 10),
        },
      },
    };

    const response = await client.createExpense(expenseData);
    const expense = response.data;

    let text = `Expense created successfully!\n`;
    text += `ID: ${expense.id}\n`;
    text += `Name: ${expense.attributes.name ?? params.name}\n`;
    text += `Date: ${expense.attributes.date}\n`;
    text += `Amount: ${expense.attributes.amount}${expense.attributes.currency ? ` ${expense.attributes.currency}` : ''}\n`;
    text += `Billable: ${expense.attributes.billable ? 'Yes' : 'No'}\n`;
    if (expense.attributes.note) text += `Note: ${expense.attributes.note}\n`;
    text += `Person ID: ${personId}${params.person_id === 'me' ? ' (me)' : ''}\n`;
    text += `Service ID: ${params.service_id}\n`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export const listExpensesDefinition = {
  name: 'list_expenses',
  description: 'List expenses in Productive.io. Filter by person, project, or date range. Use "me" for person_id if PRODUCTIVE_USER_ID is configured.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      person_id: { type: 'string', description: 'Filter by person ID. Use "me" to filter by the configured user.' },
      project_id: { type: 'string', description: 'Filter by project ID' },
      after: { type: 'string', description: 'Filter expenses after this date (YYYY-MM-DD)' },
      before: { type: 'string', description: 'Filter expenses before this date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};

export const createExpenseDefinition = {
  name: 'create_expense',
  description: 'Create a new expense record in Productive.io. Use get_project_services to find a valid service_id first.',
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name/title of the expense (required)' },
      date: { type: 'string', description: 'Date of the expense (YYYY-MM-DD) (required)' },
      amount: { type: 'number', description: 'Expense amount (required)' },
      currency: { type: 'string', description: 'Currency code, e.g. EUR, USD (required)' },
      service_id: { type: 'string', description: 'Service ID to link this expense to — use get_project_services to find valid IDs (required)' },
      person_id: { type: 'string', description: 'Person ID who incurred the expense. Use "me" if PRODUCTIVE_USER_ID is configured. (required)' },
      note: { type: 'string', description: 'Additional notes (optional)' },
      billable: { type: 'boolean', description: 'Whether the expense is billable to the client (default: false)', default: false },
    },
    required: ['name', 'date', 'amount', 'currency', 'service_id', 'person_id'],
  },
};
