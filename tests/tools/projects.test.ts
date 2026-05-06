/**
 * Tests for `list_projects`. VAL-FOUNDATION-010, 011.
 */
import { describe, it, expect } from 'vitest';
import { listProjectsTool } from '../../src/tools/projects.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool } from '../helpers/runTool.js';

const projectsFixture = {
  data: [
    {
      id: '5001',
      type: 'projects',
      attributes: { name: 'Website redesign', project_number: 1 },
      relationships: { company: { data: { id: '1001', type: 'companies' } } },
    },
    {
      id: '5002',
      type: 'projects',
      attributes: { name: 'Internal tools', project_number: 2 },
    },
  ],
  meta: { total_count: 2, page_size: 30, current_page: 1, total_pages: 1 },
};

describe('list_projects', () => {
  it('renders project list', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/projects/, body: projectsFixture }],
      () => runTool(listProjectsTool, { status: 'active' })
    );
    expect(result.content[0]?.text).toMatch(/Website redesign/);
    expect(result.content[0]?.text).toMatch(/Internal tools/);
  });

  it('shows no-projects message on empty', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/projects/,
          body: { data: [], meta: { total_count: 0 } },
        },
      ],
      () => runTool(listProjectsTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no project/);
  });

  it('throws on 422 with detail', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/projects/,
          status: 422,
          body: { errors: [{ detail: 'Invalid filter' }] },
        },
      ],
      async () => {
        await expect(runTool(listProjectsTool, {})).rejects.toThrow();
      }
    );
  });
});
