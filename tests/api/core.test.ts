/**
 * Tests for the low-level `Core` HTTP client.
 *
 * Verifies VAL-FOUNDATION-005 (header injection), VAL-FOUNDATION-015
 * (consistent error mapping), and VAL-CROSS-008 (single chokepoint for
 * fetch).
 */
import { describe, it, expect } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { Core } from '../../src/api/core.js';

const ORIGIN = 'https://api.productive.io';

function makeCore(): Core {
  return new Core({
    apiToken: 'test-token',
    organizationId: 'test-org',
    baseUrl: 'https://api.productive.io/api/v2/',
  });
}

function lowercaseKeys(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v;
  }
  return out;
}

describe('Core.request', () => {
  it('injects X-Auth-Token and X-Organization-Id on every request', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      let observedHeaders: Record<string, string> | undefined;
      pool
        .intercept({ path: '/api/v2/people/me', method: 'GET' })
        .reply((opts) => {
          observedHeaders = opts.headers as Record<string, string>;
          return {
            statusCode: 200,
            data: JSON.stringify({ data: { id: '1', type: 'people' } }),
            responseOptions: {
              headers: { 'content-type': 'application/vnd.api+json' },
            },
          };
        });

      const core = makeCore();
      await core.request('people/me');

      const lower = lowercaseKeys(observedHeaders ?? {});
      expect(lower['x-auth-token']).toBe('test-token');
      expect(lower['x-organization-id']).toBe('test-org');
      expect(lower['accept']).toBe('application/vnd.api+json');
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });

  it('serialises a JSON body and sets Content-Type when body is provided', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      let observedBody: string | undefined;
      let observedHeaders: Record<string, string> | undefined;
      pool
        .intercept({ path: '/api/v2/tasks', method: 'POST' })
        .reply((opts) => {
          observedBody = opts.body as string;
          observedHeaders = opts.headers as Record<string, string>;
          return {
            statusCode: 201,
            data: JSON.stringify({ data: { id: '99', type: 'tasks' } }),
            responseOptions: {
              headers: { 'content-type': 'application/vnd.api+json' },
            },
          };
        });

      const core = makeCore();
      await core.request('tasks', {
        method: 'POST',
        body: { data: { type: 'tasks', attributes: { title: 'x' } } },
      });

      expect(observedBody).toContain('"title":"x"');
      const lower = lowercaseKeys(observedHeaders ?? {});
      expect(lower['content-type']).toBe('application/vnd.api+json');
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });

  it('maps 401 to McpError(InternalError) with "Authentication failed"', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: '/api/v2/whoami', method: 'GET' })
        .reply(401, JSON.stringify({ errors: [{ detail: 'Bad token' }] }), {
          headers: { 'content-type': 'application/vnd.api+json' },
        });

      const core = makeCore();
      let caught: unknown;
      try {
        await core.request('whoami', { noRetry: true });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(McpError);
      const mcp = caught as McpError;
      expect(mcp.code).toBe(ErrorCode.InternalError);
      expect(mcp.message).toContain('Authentication failed');
      expect(mcp.message).toContain('Bad token');
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });

  it('maps 422 to McpError(InvalidParams) with the validation detail', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      pool.intercept({ path: '/api/v2/tasks', method: 'POST' }).reply(
        422,
        JSON.stringify({
          errors: [
            {
              detail: "Title can't be blank",
              source: { pointer: '/data/attributes/title' },
            },
          ],
        }),
        { headers: { 'content-type': 'application/vnd.api+json' } }
      );

      const core = makeCore();
      let caught: unknown;
      try {
        await core.request('tasks', {
          method: 'POST',
          body: {},
          noRetry: true,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(McpError);
      const mcp = caught as McpError;
      expect(mcp.code).toBe(ErrorCode.InvalidParams);
      expect(mcp.message).toContain("Title can't be blank");
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });

  it('maps 404 to McpError(InvalidParams) with "Not found"', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: '/api/v2/tasks/missing', method: 'GET' })
        .reply(404, JSON.stringify({ errors: [{ detail: 'No such task' }] }), {
          headers: { 'content-type': 'application/vnd.api+json' },
        });

      const core = makeCore();
      let caught: unknown;
      try {
        await core.request('tasks/missing', { noRetry: true });
      } catch (err) {
        caught = err;
      }

      const mcp = caught as McpError;
      expect(mcp).toBeInstanceOf(McpError);
      expect(mcp.code).toBe(ErrorCode.InvalidParams);
      expect(mcp.message).toContain('Not found');
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });

  it('returns parsed JSON on 2xx', async () => {
    const previous = getGlobalDispatcher();
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    try {
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: '/api/v2/companies', method: 'GET' })
        .reply(
          200,
          JSON.stringify({
            data: [{ id: '1', type: 'companies', attributes: { name: 'Acme' } }],
          }),
          { headers: { 'content-type': 'application/vnd.api+json' } }
        );

      const core = makeCore();
      const result = await core.list('companies');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.attributes?.name).toBe('Acme');
    } finally {
      await agent.close();
      setGlobalDispatcher(previous);
    }
  });
});
