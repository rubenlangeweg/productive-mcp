/**
 * Tests for `list_companies`.
 * VAL-FOUNDATION-010, 011.
 */
import { describe, it, expect } from 'vitest';
import { listCompaniesTool } from '../../src/tools/companies.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { loadFixture } from '../helpers/fixtures.js';
import { runTool } from '../helpers/runTool.js';

describe('list_companies', () => {
  it('renders a summary with each company', async () => {
    const fixture = loadFixture('companies/list-active');
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/companies/, body: fixture }],
      () => runTool(listCompaniesTool, { status: 'active' })
    );
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toMatch(/Acme Corp/);
    expect(result.content[0]?.text).toMatch(/Globex Industries/);
  });

  it('shows a no-results message when empty', async () => {
    const fixture = loadFixture('companies/empty');
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/companies/, body: fixture }],
      () => runTool(listCompaniesTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no compan/i);
  });

  it('surfaces a 401 error', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/companies/,
          status: 401,
          body: { errors: [{ detail: 'Bad token' }] },
        },
      ],
      async () => {
        await expect(
          runTool(listCompaniesTool, {})
        ).rejects.toThrow();
      }
    );
  });
});
