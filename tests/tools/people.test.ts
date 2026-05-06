import { describe, it, expect } from 'vitest';
import { listPeopleTool, getPersonTool } from '../../src/tools/people.js';
import { withFetchMock } from '../helpers/withFetchMock.js';
import { runTool } from '../helpers/runTool.js';

const peopleFixture = {
  data: [
    {
      id: '12',
      type: 'people',
      attributes: {
        first_name: 'Marthin',
        last_name: 'Pieterse',
        email: 'marthin@rb2.example.com',
        is_active: true,
      },
    },
  ],
  meta: { total_count: 1 },
};

describe('list_people', () => {
  it('renders people with name + email', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/people/, body: peopleFixture }],
      () => runTool(listPeopleTool, { is_active: true })
    );
    expect(result.content[0]?.text).toMatch(/Marthin/);
    expect(result.content[0]?.text).toMatch(/Pieterse/);
  });

  it('shows empty message', async () => {
    const result = await withFetchMock(
      [{ path: /\/api\/v2\/people/, body: { data: [], meta: { total_count: 0 } } }],
      () => runTool(listPeopleTool, {})
    );
    expect(result.content[0]?.text.toLowerCase()).toMatch(/no people|no person/);
  });
});

describe('get_person', () => {
  it('renders single person', async () => {
    const result = await withFetchMock(
      [
        {
          path: /\/api\/v2\/people\/12/,
          body: { data: peopleFixture.data[0] },
        },
      ],
      () => runTool(getPersonTool, { person_id: '12' })
    );
    expect(result.content[0]?.text).toMatch(/Marthin/);
  });

  it('throws on 404', async () => {
    await withFetchMock(
      [
        {
          path: /\/api\/v2\/people\/missing/,
          status: 404,
          body: { errors: [{ detail: 'No such person' }] },
        },
      ],
      async () => {
        await expect(
          runTool(getPersonTool, { person_id: 'missing' })
        ).rejects.toThrow();
      }
    );
  });
});
