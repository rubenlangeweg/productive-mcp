/**
 * Lightweight wrapper around `undici.MockAgent` so tests can declare a route
 * table inline without touching the global setup.
 *
 * The global `tests/setup.ts` already installs a fresh MockAgent for every
 * test. This helper layers ergonomic intercept rules on top of that agent.
 */
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
} from 'undici';

export interface RouteSpec {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string | RegExp;
  status?: number;
  body?: unknown;
  /** Extra headers to send with the response (e.g. `Retry-After`). */
  headers?: Record<string, string>;
}

const DEFAULT_ORIGIN = 'https://api.productive.io';

/**
 * Run `fn` with the given route table installed. Each route specifies an HTTP
 * method (default GET), a URL path or RegExp, an HTTP status (default 200),
 * an optional response body (serialised as JSON), and optional response
 * headers. Routes match in declaration order; unmatched fetches throw.
 *
 * The function takes ownership of the global dispatcher for the duration of
 * the call. Multiple `withFetchMock` calls in the same test must NOT be
 * nested.
 */
export async function withFetchMock<T>(
  routes: RouteSpec[],
  fn: () => Promise<T>,
  origin: string = DEFAULT_ORIGIN
): Promise<T> {
  const previousDispatcher: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);

  const pool = agent.get(origin);
  for (const route of routes) {
    pool
      .intercept({ path: route.path, method: route.method ?? 'GET' })
      .reply(
        route.status ?? 200,
        typeof route.body === 'string'
          ? route.body
          : JSON.stringify(route.body ?? {}),
        {
          headers: {
            'content-type': 'application/vnd.api+json',
            ...(route.headers ?? {}),
          },
        }
      );
  }

  try {
    return await fn();
  } finally {
    await agent.close();
    setGlobalDispatcher(previousDispatcher);
  }
}

/**
 * Lower-level variant that installs a MockAgent and returns the pool so a
 * test can call `pool.intercept(...)` directly. Caller MUST invoke
 * the returned cleanup function (typically in `afterEach`).
 */
export function installMockAgent(origin: string = DEFAULT_ORIGIN): {
  agent: MockAgent;
  pool: ReturnType<MockAgent['get']>;
  cleanup: () => Promise<void>;
} {
  const previous: Dispatcher = getGlobalDispatcher();
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  const pool = agent.get(origin);
  return {
    agent,
    pool,
    cleanup: async () => {
      await agent.close();
      setGlobalDispatcher(previous);
    },
  };
}
