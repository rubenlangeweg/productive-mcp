# Vitest Setup for the productive-mcp ESM TypeScript Server

Reference guide for adding a complete test harness to `productive-mcp-rb2`.
The server is pure Node ESM (`"type": "module"`), TypeScript 5.8, Node 22 (≥18 required), Zod 3.25, MCP SDK 1.27.1.
No React, no browser, no bundler.

---

## 1. Dev Dependencies

Install exactly these:

```bash
npm install --save-dev \
  vitest \
  @vitest/coverage-v8 \
  undici
```

**Why `undici` instead of msw?**

| Concern | msw (node) | undici `MockAgent` |
|---|---|---|
| Bundle weight | ~3 MB + `@mswjs/interceptors` | ~0 KB extra (already in Node 18+) |
| ESM support | Needs `setupServer` + special lifecycle | Native, no lifecycle ceremony |
| Works without a DOM | Yes | Yes |
| Intercept granularity | URL pattern matching | URL pattern + method matching |
| Familiarity | High (browser MSW overlap) | Moderate |

MSW is excellent for fullstack apps where you share handlers between browser and Node tests.
For a pure server that only ever runs `fetch` against `api.productive.io`, the extra weight and lifecycle
setup of MSW buys nothing. `undici`'s `MockAgent` intercepts Node's global `fetch` (since Node 18, `fetch`
is backed by `undici` internally) and is already in `node_modules` transitively.

The `undici` package gives you the explicit `MockAgent` class — the internal one bundled with Node is not
directly importable, so we declare `undici` as an explicit dev dep for clean imports.

---

## 2. `vitest.config.ts`

This is **not** the standard Next.js config. There is no `jsdom` environment, no React plugin, and
module resolution must match Node16 (the project `tsconfig.json` target).

```ts
// vitest.config.ts  (project root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure Node — no DOM emulation needed
    environment: 'node',

    // Vitest natively handles ESM; no transform plugin required for plain TS
    // The `include` glob is relative to the project root
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // Load test-only env overrides before any test file runs
    setupFiles: ['tests/setup.ts'],

    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',        // entry point glue — just wires things together
        'src/server.ts',       // dispatch glue — covered by e2e tests, hard to unit-test
        'src/api/types.ts',    // type-only file, no runtime logic
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      reporter: ['text', 'lcov', 'html'],
    },

    // Prevent tests from accidentally reading production .env
    env: {
      PRODUCTIVE_API_TOKEN: 'test-token',
      PRODUCTIVE_ORG_ID: 'test-org',
      PRODUCTIVE_API_BASE_URL: 'https://api.productive.io/api/v2/',
    },
  },
});
```

Key differences from a Next.js config:
- `environment: 'node'` (not `jsdom`)
- No `@vitejs/plugin-react` in the `plugins` array
- `moduleResolution` does not need to be set in Vitest config — it follows the project's `tsconfig.json`

---

## 3. Test Directory Layout

**Recommendation: co-locate as `<file>.test.ts`.**

```
src/
  api/
    client.ts
    client.test.ts          ← unit tests for ProductiveAPIClient
    types.ts
  tools/
    tasks.ts
    tasks.test.ts           ← unit tests for listTasksTool, getTaskTool, …
    time-entries.ts
    time-entries.test.ts
  config/
    index.ts
    index.test.ts
tests/
  fixtures/
    companies/
      list-active.json
      empty.json
    tasks/
      list-open.json
      single.json
    time-entries/
      list-today.json
      create-response.json
  helpers/
    fetch-mock.ts           ← withFetchMock() helper
    mcp-client.ts           ← runTool() helper using InMemoryTransport
  setup.ts                  ← global beforeEach / afterEach
  e2e/
    tools-list.test.ts      ← snapshot test for tool surface
    time-entries.test.ts    ← end-to-end tool invocations
```

**Rationale:** Co-locating `*.test.ts` next to the source keeps the feedback loop tight and avoids
`../../../` import chains in test files. The `tests/` directory is reserved for shared helpers,
fixtures, and integration/e2e tests that span multiple source files.

---

## 4. Fixture Pattern

Capture real API responses once, commit them as JSON, reuse forever.

### Capture script (run once, not part of CI)

```ts
// scripts/capture-fixtures.ts
// Run with: node --loader ts-node/esm scripts/capture-fixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '../src/config/index.js';
import { ProductiveAPIClient } from '../src/api/client.js';

const client = new ProductiveAPIClient(getConfig());

async function capture(name: string, data: unknown): Promise<void> {
  const [resource, scenario] = name.split('/');
  mkdirSync(join('tests/fixtures', resource), { recursive: true });
  writeFileSync(
    join('tests/fixtures', name + '.json'),
    JSON.stringify(data, null, 2)
  );
  console.log('saved', name);
}

const companies = await client.listCompanies({ status: 'active', limit: 5 });
await capture('companies/list-active', companies);

const tasks = await client.listTasks({ status: 'open', limit: 5 });
await capture('tasks/list-open', tasks);
```

### Loading fixtures in tests

```ts
// tests/helpers/fixtures.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(
  fileURLToPath(import.meta.url),
  '../../fixtures'
);

export function loadFixture<T = unknown>(path: string): T {
  const raw = readFileSync(join(FIXTURES_DIR, `${path}.json`), 'utf-8');
  return JSON.parse(raw) as T;
}
```

Usage:
```ts
import { loadFixture } from '../helpers/fixtures.js';
import type { ProductiveResponse, ProductiveTask } from '../../src/api/types.js';

const fixture = loadFixture<ProductiveResponse<ProductiveTask>>('tasks/list-open');
```

---

## 5. Mocking Global `fetch` with undici MockAgent

`ProductiveAPIClient.makeRequest` calls the global `fetch`. Since Node 18+ wires `fetch` through
`undici`, swapping `undici`'s global dispatcher intercepts every `fetch` call transparently.

### Core helper

```ts
// tests/helpers/fetch-mock.ts
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';

export type RouteSpec = {
  method?: string;
  path: string | RegExp;
  status?: number;
  body: unknown;
};

/**
 * Install a MockAgent for the duration of a single test or describe block.
 * Returns the agent so individual tests can add extra intercepts.
 *
 * @example
 * const { agent, pool } = useFetchMock('https://api.productive.io');
 *
 * pool.intercept({ path: '/api/v2/tasks?...', method: 'GET' })
 *     .reply(200, fixture);
 */
export function useFetchMock(origin: string): {
  agent: MockAgent;
  pool: ReturnType<MockAgent['get']>;
} {
  let agent: MockAgent;
  let original: Dispatcher;

  beforeEach(() => {
    original = getGlobalDispatcher();
    agent = new MockAgent({ connections: 1 });
    agent.disableNetConnect(); // hard-fail on unmocked URLs
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    await agent.close();
    setGlobalDispatcher(original);
  });

  // `get` returns a MockPool; call lazily inside tests
  const getPool = (): ReturnType<MockAgent['get']> => agent.get(origin);

  // Proxy object so callers can write `pool.intercept(...)` naturally
  return {
    get agent() { return agent; },
    get pool() { return getPool(); },
  };
}

/**
 * One-shot helper for tests that only need a single route.
 *
 * @example
 * withFetchMock([
 *   { path: '/api/v2/companies', body: fixture }
 * ], async () => {
 *   const result = await client.listCompanies();
 *   expect(result.data).toHaveLength(2);
 * });
 */
export async function withFetchMock(
  origin: string,
  routes: RouteSpec[],
  fn: () => Promise<void>
): Promise<void> {
  const original = getGlobalDispatcher();
  const agent = new MockAgent({ connections: 1 });
  agent.disableNetConnect();
  setGlobalDispatcher(agent);

  try {
    const pool = agent.get(origin);
    for (const route of routes) {
      pool
        .intercept({ path: route.path, method: route.method ?? 'GET' })
        .reply(
          route.status ?? 200,
          JSON.stringify(route.body),
          { headers: { 'content-type': 'application/vnd.api+json' } }
        );
    }
    await fn();
  } finally {
    await agent.close();
    setGlobalDispatcher(original);
  }
}
```

### Using the helper in a unit test

```ts
// src/api/client.test.ts
import { describe, it, expect } from 'vitest';
import { ProductiveAPIClient } from './client.js';
import { withFetchMock } from '../../tests/helpers/fetch-mock.js';
import { loadFixture } from '../../tests/helpers/fixtures.js';

const BASE = 'https://api.productive.io';
const client = new ProductiveAPIClient({
  PRODUCTIVE_API_TOKEN: 'test-token',
  PRODUCTIVE_ORG_ID: 'test-org',
  PRODUCTIVE_API_BASE_URL: `${BASE}/api/v2/`,
});

describe('ProductiveAPIClient.listCompanies', () => {
  it('returns parsed companies on 200', async () => {
    const fixture = loadFixture('companies/list-active');

    await withFetchMock(BASE, [{ path: /\/api\/v2\/companies/, body: fixture }], async () => {
      const result = await client.listCompanies({ status: 'active' });
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  it('throws a human-readable message on 401', async () => {
    await withFetchMock(
      BASE,
      [{ path: /\/api\/v2\/companies/, status: 401, body: { errors: [{ detail: 'Bad token' }] } }],
      async () => {
        await expect(client.listCompanies()).rejects.toThrow('Authentication failed: Bad token');
      }
    );
  });
});
```

---

## 6. In-Memory MCP Transport for End-to-End Tool Tests

The MCP SDK ships `InMemoryTransport` at
`@modelcontextprotocol/sdk/dist/esm/inMemory.js` (types at `inMemory.d.ts`).
It creates a bidirectional linked pair — one end connects to the `Server`, one to a `Client` —
entirely in-process with no sockets.

### MCP test helper

```ts
// tests/helpers/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Wire a Server to an in-process Client and return a `callTool` function.
 * The cleanup callback must be called in afterEach/afterAll.
 */
export async function createTestClient(server: Server): Promise<{
  callTool: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  cleanup: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'test-client', version: '0.0.1' },
    { capabilities: { tools: {} } }
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    async callTool(name, args = {}): Promise<ToolResult> {
      const result: CallToolResult = await client.callTool({ name, arguments: args });
      return result as ToolResult;
    },
    async cleanup() {
      await client.close();
    },
  };
}
```

### runTool convenience wrapper

For tests that need to call a single tool handler directly (no full MCP round-trip), import the handler
function and call it with a mock client:

```ts
// tests/helpers/run-tool.ts
import { ProductiveAPIClient } from '../../src/api/client.js';
import type { Config } from '../../src/config/index.js';

const TEST_CONFIG: Config = {
  PRODUCTIVE_API_TOKEN: 'test-token',
  PRODUCTIVE_ORG_ID: 'test-org',
  PRODUCTIVE_API_BASE_URL: 'https://api.productive.io/api/v2/',
};

export function makeTestClient(): ProductiveAPIClient {
  return new ProductiveAPIClient(TEST_CONFIG);
}

export type ToolHandler = (
  client: ProductiveAPIClient,
  args: unknown
) => Promise<{ content: Array<{ type: string; text: string }> }>;

/**
 * Call a tool handler directly with a pre-wired API client.
 *
 * @example
 * const result = await runTool(listTasksTool, { project_id: '123' });
 * expect(result.content[0].text).toContain('Found');
 */
export async function runTool(
  handler: ToolHandler,
  args: unknown,
  clientOverride?: ProductiveAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  return handler(clientOverride ?? makeTestClient(), args);
}
```

---

## 7. Test Structure for a Tool

Pattern: arrange fixture → intercept fetch → call handler → assert content + side effects.

```ts
// src/tools/tasks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listTasksTool } from './tasks.js';
import { withFetchMock } from '../../tests/helpers/fetch-mock.js';
import { runTool, makeTestClient } from '../../tests/helpers/run-tool.js';
import { loadFixture } from '../../tests/helpers/fixtures.js';

const ORIGIN = 'https://api.productive.io';

describe('listTasksTool', () => {
  it('renders a summary line when tasks are found', async () => {
    const fixture = loadFixture('tasks/list-open');

    await withFetchMock(ORIGIN, [{ path: /\/api\/v2\/tasks/, body: fixture }], async () => {
      const result = await runTool(listTasksTool, { status: 'open', limit: 5 });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toMatch(/Found \d+ task/);
    });
  });

  it('returns a "no tasks" message on empty response', async () => {
    await withFetchMock(
      ORIGIN,
      [{ path: /\/api\/v2\/tasks/, body: { data: [], meta: { total_count: 0 } } }],
      async () => {
        const result = await runTool(listTasksTool, {});
        expect(result.content[0].text).toBe('No tasks found matching the criteria.');
      }
    );
  });

  it('throws McpError with InvalidParams on bad arguments', async () => {
    // No fetch mock needed — Zod rejects before any network call
    await expect(runTool(listTasksTool, { limit: 999 })).rejects.toThrow('Invalid parameters');
  });

  it('calls the correct URL path', async () => {
    const fixture = loadFixture('tasks/list-open');
    const client = makeTestClient();
    const fetchSpy = vi.spyOn(global, 'fetch');

    await withFetchMock(
      ORIGIN,
      [{ path: /\/api\/v2\/tasks/, body: fixture }],
      async () => {
        await runTool(listTasksTool, { project_id: '42' }, client);

        const calledUrl = String((fetchSpy.mock.calls[0] as [string])[0]);
        expect(calledUrl).toContain('filter[project_id]=42');
      }
    );

    fetchSpy.mockRestore();
  });
});
```

---

## 8. Coverage Thresholds

Set in `vitest.config.ts` (see section 2). Summary of rationale:

| Metric | Threshold | Rationale |
|---|---|---|
| Lines | 80% | Standard minimum; tool handlers are straight-line code |
| Branches | 75% | `switch` on HTTP status codes has many paths; 75% is realistic |
| Functions | 80% | Covers exported tool handlers and API client methods |
| Statements | 80% | Effectively same as lines for this codebase |

Files excluded from coverage:
- `src/index.ts` — entry point shim (`#!/usr/bin/env node`, calls `createServer`)
- `src/server.ts` — the giant dispatch switch; covered by e2e tests, not unit-testable in isolation
- `src/api/types.ts` — pure TypeScript interfaces, no runtime code

Run coverage locally:
```bash
npm run test:coverage
# opens ./coverage/index.html
```

---

## 9. Snapshot Tests for Tool Descriptions and Output Schemas

When a worker agent changes a tool's `name`, `description`, or `inputSchema`, a snapshot test will fail
and force a deliberate decision instead of an accidental drift.

### Setup

```ts
// tests/e2e/tool-surface.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient } from '../helpers/mcp-client.js';
import { createServer } from '../../src/server.js';
import { withFetchMock } from '../helpers/fetch-mock.js';

// The server reads process.env at construction time — values are set in vitest.config.ts `env`

describe('Tool surface snapshot', () => {
  it('list_tools output matches snapshot', async () => {
    // createServer calls getConfig() which reads process.env
    const server = await createServer();
    const { callTool: _callTool, cleanup } = await createTestClient(server);

    // Use the MCP client directly for list_tools
    // (we expose the underlying client via a small helper)
    // Simplest approach: call list_tools via the SDK Client
    // See mcp-client.ts — extend it to expose client.listTools() if needed

    afterAll(cleanup);

    // The snapshot captures tool names + description hashes so renames are caught
    const { tools } = await (server as any)._registeredHandlers; // internal — prefer SDK client
    expect(tools).toMatchSnapshot();
  });
});
```

A more robust approach uses the `Client` directly:

```ts
// tests/e2e/tool-surface.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';

describe('Tool surface', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const server = await createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'snap-client', version: '0.0.0' }, { capabilities: { tools: {} } });
    await server.connect(st);
    await client.connect(ct);
    cleanup = () => client.close();
  });

  afterAll(async () => cleanup?.());

  it('tool list matches snapshot', async () => {
    const { tools } = await client.listTools();
    // Sort for stable snapshots
    const sorted = tools
      .map(t => ({ name: t.name, description: t.description }))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(sorted).toMatchSnapshot();
  });

  it('inputSchema for each tool matches snapshot', async () => {
    const { tools } = await client.listTools();
    const schemas = Object.fromEntries(
      tools
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => [t.name, t.inputSchema])
    );
    expect(schemas).toMatchSnapshot();
  });
});
```

Update snapshots intentionally with:
```bash
npx vitest --update-snapshots
```

Snapshots are committed to git under `tests/e2e/__snapshots__/`.

---

## 10. Helper Recipes

### `withFetchMock` (see section 5 above)

### `runTool` (see section 6 above)

### Schema parity assertion

Every tool should declare an `outputSchema` (MCP SDK 1.10+). This assertion ensures the actual
`structuredContent` a tool returns can be validated by its own declared schema at runtime.

```ts
// tests/helpers/schema-parity.ts
import { z } from 'zod';
import type { ZodSchema } from 'zod';

/**
 * Assert that `value` matches `schema`. Throws with a readable diff on failure.
 * Use inside a tool test to verify structuredContent matches outputSchema.
 *
 * @example
 * assertMatchesSchema(result.structuredContent, myToolOutputSchema);
 */
export function assertMatchesSchema<T>(value: unknown, schema: ZodSchema<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `structuredContent does not match outputSchema:\n${JSON.stringify(parsed.error.format(), null, 2)}`
    );
  }
  return parsed.data;
}
```

Usage in a tool test:
```ts
import { assertMatchesSchema } from '../../tests/helpers/schema-parity.js';
import { listTasksOutputSchema } from './tasks.js'; // export your Zod schema

it('structuredContent matches outputSchema', async () => {
  await withFetchMock(ORIGIN, [{ path: /tasks/, body: fixture }], async () => {
    const result = await runTool(listTasksTool, {});
    assertMatchesSchema(result.structuredContent, listTasksOutputSchema);
  });
});
```

---

## 11. CI — GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      # Type-check without emitting — catches TS errors before tests run
      - run: npx tsc --noEmit

      # Run tests with coverage; vitest exits non-zero if thresholds are not met
      - run: npm run test:coverage

      # Upload the lcov report so PRs show coverage deltas (optional but recommended)
      - uses: codecov/codecov-action@v4
        if: always()
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
```

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

The `--coverage` flag reads thresholds from `vitest.config.ts`; the process exits with code 1 if
any threshold is missed, which fails the CI job.

---

## 12. Gotchas

### ESM + `vi.mock`

`vi.mock` is hoisted to the top of the file by Vitest's transform, but in a true ESM module the
`import` statements run before any code. The practical effect: **`vi.mock` calls must appear at the
top of the test file, before imports, and the path must match the import exactly including the `.js`
extension** (even though the source is `.ts`).

```ts
// CORRECT — path uses .js extension as required by Node16 moduleResolution
vi.mock('../../src/config/index.js', () => ({
  getConfig: () => ({
    PRODUCTIVE_API_TOKEN: 'test',
    PRODUCTIVE_ORG_ID: 'test-org',
    PRODUCTIVE_API_BASE_URL: 'https://api.productive.io/api/v2/',
  }),
}));
```

If you get `Cannot find module` errors in mocks, check that the extension in the mock path matches
the extension in the source `import` statement.

### Top-level `await` in test files

Vitest supports top-level `await` in ESM test files natively. This is fine:

```ts
// tests/fixtures.ts — used as a module, not a test file
const data = await fs.readFile(...)  // valid in ESM
```

But be careful: if a module with top-level `await` is imported in a `vi.mock` factory, Vitest may
not handle it correctly. Keep fixture-loading synchronous (`readFileSync`) or inside `beforeAll`.

### dotenv pollution

`src/config/index.ts` calls `dotenv.config()` which would load your real `.env` file during tests,
injecting real API tokens. The `vitest.config.ts` `env` block sets process.env **before** any test
module loads, but `dotenv.config()` will overwrite those values if a `.env` file exists.

Two mitigations (pick one):

**Option A** — Guard in `tests/setup.ts`:
```ts
// tests/setup.ts
import { vi } from 'vitest';

// Prevent dotenv from reading .env during tests
vi.mock('dotenv', () => ({ config: () => undefined }));
```

**Option B** — Create `.env.test` and set `DOTENV_CONFIG_PATH`:
```bash
# .env.test
PRODUCTIVE_API_TOKEN=test-token
PRODUCTIVE_ORG_ID=test-org
```
```ts
// vitest.config.ts
env: { DOTENV_CONFIG_PATH: '.env.test' }
```

Option A is simpler. Option B is better if you want a real `.env.test` for integration tests.

### `createServer()` calls `getConfig()` at module load time

The `createServer` function in `src/server.ts` calls `getConfig()` (which calls `dotenv`) at
construction time, not lazily. This means any test that imports `createServer` will trigger
config validation. Ensure the `env` block in `vitest.config.ts` always contains the four required
variables (`PRODUCTIVE_API_TOKEN`, `PRODUCTIVE_ORG_ID`, and optionally the others with defaults).

### `moduleResolution: "Node16"` and `.js` extensions

The project `tsconfig.json` uses `"moduleResolution": "Node16"`. This means every relative import
in source files must end with `.js` (not `.ts`). Vitest resolves `.js` imports to their `.ts`
counterparts automatically via its TypeScript transform, so you **do not** change the extensions in
test files — write `.js` everywhere, matching the source.

### `InMemoryTransport` import path

The in-memory transport is at a non-standard path in the SDK package:

```ts
// Correct — matches the package.json exports map in SDK 1.27
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
```

If you see `ERR_PACKAGE_PATH_NOT_EXPORTED`, check the SDK's `package.json` exports map:
```bash
cat node_modules/@modelcontextprotocol/sdk/package.json | grep -A 5 '"inMemory"'
```

---

## 13. References

- [Vitest configuration reference](https://vitest.dev/config/)
- [Vitest ESM guide](https://vitest.dev/guide/browser/examples.html) — ignore the browser section; see "Node" examples
- [undici MockAgent docs](https://undici.nodejs.org/#/docs/api/MockAgent)
- [`@modelcontextprotocol/sdk` source](https://github.com/modelcontextprotocol/typescript-sdk) — `src/inMemory.ts`
- [MCP SDK Client API](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/index.ts)
- [Node 18 built-in fetch (undici)](https://nodejs.org/en/blog/announcements/v18-release-announce#fetch-experimental) — fetch is backed by undici since Node 18
- [Vitest coverage thresholds](https://vitest.dev/config/#coverage-thresholds)
- [Vitest snapshot testing](https://vitest.dev/guide/snapshot)
