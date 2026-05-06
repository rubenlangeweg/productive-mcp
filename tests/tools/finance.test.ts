import { describe, it, expect } from 'vitest';
import {
  listInvoicesTool,
  getInvoiceTool,
} from '../../src/tools/invoices.js';
import {
  listExpensesTool,
  createExpenseTool,
} from '../../src/tools/expenses.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool, TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

describe('list_invoices', () => {
  it('renders invoices', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/invoices/,
          body: {
            data: [
              {
                id: '8001',
                type: 'invoices',
                attributes: {
                  number: 'INV-2026-001',
                  amount: 250000,
                  total: 250000,
                  status: 1,
                  invoice_date: '2026-04-01',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      () => runTool(listInvoicesTool, {})
    );
    expect(result.content[0]?.text).toMatch(/INV-2026-001/);
  });

  it('shows empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/invoices/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      () => runTool(listInvoicesTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no invoice/);
  });
});

describe('get_invoice', () => {
  it('renders single invoice', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/invoices\/8001/,
          body: {
            data: {
              id: '8001',
              type: 'invoices',
              attributes: {
                number: 'INV-2026-001',
                amount: 250000,
                total: 250000,
                status: 1,
              },
            },
          },
        },
      ],
      () => runTool(getInvoiceTool, { invoice_id: '8001' })
    );
    expect(result.content[0]?.text).toMatch(/INV-2026-001/);
  });

  it('throws on 404', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/invoices\/missing/,
          status: 404,
          body: { errors: [{ detail: 'Not found' }] },
        },
      ],
      async () => {
        await expect(
          runTool(getInvoiceTool, { invoice_id: 'missing' })
        ).rejects.toThrow();
      }
    );
  });
});

describe('list_expenses', () => {
  it('renders expenses', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/expenses/,
          body: {
            data: [
              {
                id: '9001',
                type: 'expenses',
                attributes: {
                  name: 'Hosting',
                  amount: 5000,
                  date: '2026-04-15',
                  currency: 'EUR',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listExpensesTool(client, {}, TEST_CONFIG);
      }
    );
    // Tool currently shows date + amount + currency; fixture has matching values.
    expect(result.content[0]?.text).toMatch(/9001/);
    expect(result.content[0]?.text).toMatch(/EUR/);
  });

  it('shows empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/expenses/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return listExpensesTool(client, {}, TEST_CONFIG);
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no expense/);
  });
});

describe('create_expense', () => {
  it('throws when required fields missing', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    await expect(createExpenseTool(client, {}, TEST_CONFIG)).rejects.toThrow();
  });
});
