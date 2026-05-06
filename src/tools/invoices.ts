import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const STATUS_LABELS: Record<number, string> = { 1: 'draft', 2: 'sent', 3: 'paid', 4: 'canceled' };

const listInvoicesSchema = z.object({
  company_id: z.string().optional(),
  project_id: z.string().optional(),
  status: z.number().int().min(1).max(4).optional().describe('1=draft, 2=sent, 3=paid, 4=canceled'),
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const getInvoiceSchema = z.object({
  invoice_id: z.string().min(1, 'Invoice ID is required'),
});

export const listInvoicesOutputSchema = z.object({
  invoices: z.array(z.object({
    id: z.string(),
    number: z.string().optional(),
    status: z.string().optional(),
    total: z.number().optional(),
    currency: z.string().optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    companyId: z.string().optional(),
    projectId: z.string().optional(),
  })),
  returned: z.number(),
  total: z.number().optional(),
});

export const getInvoiceOutputSchema = z.object({
  id: z.string(),
  number: z.string().optional(),
  status: z.string().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  currency: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.string().optional(),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

function fmtCurrency(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return 'N/A';
  return `${currency ?? 'USD'} ${(amount / 100).toFixed(2)}`;
}

export async function listInvoicesTool(client: ProductiveAPIClient, args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: z.infer<typeof listInvoicesOutputSchema>;
}> {
  try {
    const params = listInvoicesSchema.parse(args || {});
    const response = await client.listInvoices({
      company_id: params.company_id, project_id: params.project_id, status: params.status,
      after: params.after, before: params.before, limit: params.limit, page: params.page,
    });

    if (!response.data?.length) {
      return { content: [{ type: 'text', text: 'No invoices found matching the criteria.' }], structuredContent: { invoices: [], returned: 0 } };
    }

    const invoices = response.data.map(inv => ({
      id: inv.id,
      ...(inv.attributes.number ? { number: inv.attributes.number } : {}),
      ...(inv.attributes.status != null ? { status: STATUS_LABELS[inv.attributes.status] ?? `status ${inv.attributes.status}` } : {}),
      ...(inv.attributes.total != null ? { total: inv.attributes.total as number } : {}),
      ...(inv.attributes.currency ? { currency: inv.attributes.currency as string } : {}),
      ...(inv.attributes.invoice_date ? { invoiceDate: inv.attributes.invoice_date } : {}),
      ...(inv.attributes.due_date ? { dueDate: inv.attributes.due_date } : {}),
      ...(inv.relationships?.company?.data?.id ? { companyId: inv.relationships.company.data.id } : {}),
      ...(inv.relationships?.project?.data?.id ? { projectId: inv.relationships.project.data.id } : {}),
    }));

    const totalCount = response.meta?.total_count;
    const text = invoices.map(inv =>
      `• Invoice ${inv.number ?? inv.id} (ID: ${inv.id})\n  Status: ${inv.status ?? 'unknown'}\n  Total: ${fmtCurrency(inv.total, inv.currency)}${inv.invoiceDate ? `\n  Date: ${inv.invoiceDate}` : ''}${inv.dueDate ? `\n  Due: ${inv.dueDate}` : ''}${inv.companyId ? `\n  Company ID: ${inv.companyId}` : ''}${inv.projectId ? `\n  Project ID: ${inv.projectId}` : ''}`
    ).join('\n\n');

    const n = invoices.length;
    return {
      content: [{ type: 'text', text: `Found ${n} invoice${n !== 1 ? 's' : ''}${totalCount ? ` (showing ${n} of ${totalCount})` : ''}:\n\n${text}` }],
      structuredContent: { invoices, returned: n, ...(totalCount != null ? { total: totalCount } : {}) },
    };
  } catch (error) { handleError(error); }
}

export async function getInvoiceTool(client: ProductiveAPIClient, args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: z.infer<typeof getInvoiceOutputSchema>;
}> {
  try {
    const params = getInvoiceSchema.parse(args);
    const response = await client.getInvoice(params.invoice_id);
    const inv = response.data;

    const sc: z.infer<typeof getInvoiceOutputSchema> = {
      id: inv.id,
      ...(inv.attributes.number ? { number: inv.attributes.number } : {}),
      ...(inv.attributes.status != null ? { status: STATUS_LABELS[inv.attributes.status] ?? `status ${inv.attributes.status}` } : {}),
      ...(inv.attributes.total != null ? { total: inv.attributes.total as number } : {}),
      ...(inv.attributes.paid_amount != null ? { paidAmount: inv.attributes.paid_amount as number } : {}),
      ...(inv.attributes.currency ? { currency: inv.attributes.currency as string } : {}),
      ...(inv.attributes.invoice_date ? { invoiceDate: inv.attributes.invoice_date } : {}),
      ...(inv.attributes.due_date ? { dueDate: inv.attributes.due_date } : {}),
      ...(inv.attributes.note ? { note: inv.attributes.note } : {}),
      ...(inv.relationships?.company?.data?.id ? { companyId: inv.relationships.company.data.id } : {}),
      ...(inv.relationships?.project?.data?.id ? { projectId: inv.relationships.project.data.id } : {}),
      ...(inv.attributes.created_at ? { createdAt: inv.attributes.created_at } : {}),
    };

    let text = `Invoice Details:\n\nNumber: ${sc.number ?? sc.id}\nID: ${sc.id}\nStatus: ${sc.status ?? 'unknown'}\nTotal: ${fmtCurrency(sc.total, sc.currency)}`;
    if (sc.paidAmount !== undefined) text += `\nPaid: ${fmtCurrency(sc.paidAmount, sc.currency)}`;
    if (sc.invoiceDate) text += `\nInvoice Date: ${sc.invoiceDate}`;
    if (sc.dueDate) text += `\nDue Date: ${sc.dueDate}`;
    if (sc.note) text += `\nNote: ${sc.note}`;
    if (sc.companyId) text += `\nCompany ID: ${sc.companyId}`;
    if (sc.projectId) text += `\nProject ID: ${sc.projectId}`;
    if (sc.createdAt) text += `\nCreated: ${sc.createdAt}`;

    return { content: [{ type: 'text', text }], structuredContent: sc };
  } catch (error) { handleError(error); }
}

export const listInvoicesDefinition = {
  name: 'list_invoices',
  description: 'List invoices in Productive.io. Filter by company, project, or status (1=draft, 2=sent, 3=paid, 4=canceled) and date range.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'List invoices' },
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Filter by company ID' },
      project_id: { type: 'string', description: 'Filter by project ID' },
      status: { type: 'number', description: 'Filter by status: 1=draft, 2=sent, 3=paid, 4=canceled', minimum: 1, maximum: 4 },
      after: { type: 'string', description: 'Filter invoices dated after this date (YYYY-MM-DD)' },
      before: { type: 'string', description: 'Filter invoices dated before this date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
  outputSchema: listInvoicesOutputSchema.shape,
};

export const getInvoiceDefinition = {
  name: 'get_invoice',
  description: 'Get detailed information about a specific invoice by its Productive ID.',
  annotations: { readOnlyHint: true, idempotentHint: true, title: 'Get invoice' },
  inputSchema: {
    type: 'object',
    properties: { invoice_id: { type: 'string', description: 'The ID of the invoice to retrieve (required)' } },
    required: ['invoice_id'],
  },
  outputSchema: getInvoiceOutputSchema.shape,
};
