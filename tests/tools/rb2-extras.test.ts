/**
 * Tests for rb2-specific tools: budgets, org overview, resource plan,
 * overbooked people. These touch the legacy `getAllPages` helper.
 */
import { describe, it, expect } from 'vitest';
import { getBudgetBurnTool_handler } from '../../src/tools/budgets.js';
import {
  getResourcePlanHandler,
  getOverbookedPeopleHandler,
} from '../../src/tools/bookings.js';
import { getOrgOverviewHandler } from '../../src/tools/org.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

describe('get_budget_burn', () => {
  it('summarises budget deals', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/deals/,
          body: {
            data: [
              {
                id: 'd1',
                type: 'deals',
                attributes: {
                  name: 'Budget A',
                  budget: true,
                  budget_total: 100000,
                  budget_used: 70000,
                  invoiced: 50000,
                },
              },
              {
                id: 'd2',
                type: 'deals',
                attributes: {
                  name: 'Budget B',
                  budget: true,
                  budget_total: 200000,
                  budget_used: 30000,
                  invoiced: 20000,
                },
              },
            ],
            meta: { total_count: 2 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return getBudgetBurnTool_handler(client, {});
      }
    );
    expect(result.content[0]?.text).toMatch(/Budget A/);
    expect(result.content[0]?.text).toMatch(/%/);
  });

  it('reports no-budgets when none match', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/deals/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return getBudgetBurnTool_handler(client, {});
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(no budget|no deal)/
    );
  });
});

describe('get_resource_plan / get_overbooked_people', () => {
  it('renders an empty resource plan gracefully', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/bookings/,
          body: { data: [], included: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return getResourcePlanHandler(client, {
          after: '2026-05-01',
          before: '2026-05-07',
        });
      }
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });

  it('renders empty overbooked-people report', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/bookings/,
          body: { data: [], included: [], meta: { total_count: 0 } },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return getOverbookedPeopleHandler(client, {
          after: '2026-05-01',
          before: '2026-05-07',
        });
      }
    );
    expect(result.content[0]?.text.length).toBeGreaterThan(0);
  });
});

describe('get_org_overview', () => {
  it('returns an overview when API responds', async () => {
    const result = await withFetchMock(
      [
        // peopleRaw via getAllPages — single page
        {
          path: /\/api\/v2\/people/,
          body: {
            data: [
              {
                id: '12',
                type: 'people',
                attributes: {
                  first_name: 'Marthin',
                  last_name: 'Pieterse',
                },
                relationships: {
                  subsidiary: { data: { id: '1', type: 'subsidiaries' } },
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
        {
          path: /\/api\/v2\/projects/,
          body: {
            data: [
              { id: '5001', type: 'projects', attributes: { name: 'Site' } },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return getOrgOverviewHandler(client, {});
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/org|subsidiary|projects/);
  });
});
