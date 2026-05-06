import { describe, it, expect } from 'vitest';
import { whoAmI } from '../../src/tools/whoami.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { TEST_CONFIG } from '../helpers/runTool.js';
import { ProductiveAPIClient } from '../../src/api/client.js';

describe('whoami', () => {
  it('reports the configured user (via listPeople)', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/people/,
          body: {
            data: [
              {
                id: 'test-user',
                type: 'people',
                attributes: {
                  first_name: 'Test',
                  last_name: 'User',
                  email: 'test@example.com',
                },
              },
            ],
            meta: { total_count: 1 },
          },
        },
      ],
      async () => {
        const client = new ProductiveAPIClient(TEST_CONFIG);
        return whoAmI(client, {}, TEST_CONFIG);
      }
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/test-user|user/);
  });

  it('reports no-user when PRODUCTIVE_USER_ID is not set', async () => {
    const client = new ProductiveAPIClient(TEST_CONFIG);
    const result = await whoAmI(client, {}, {
      ...TEST_CONFIG,
      PRODUCTIVE_USER_ID: undefined,
    });
    // Some output indicating no configured user
    expect(result.content[0]?.text.toLowerCase()).toMatch(
      /(no user|not configured|missing)/
    );
  });
});
