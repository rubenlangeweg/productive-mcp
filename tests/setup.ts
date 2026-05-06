/**
 * Global test setup for Vitest.
 *
 * - Forces NODE_ENV=test (vitest config also sets it; defence in depth).
 * - Mocks `dotenv` so `src/config/index.ts` does not load a developer's local
 *   `.env` file during tests, which would inject real Productive API tokens.
 * - Installs an undici MockAgent that hard-fails any unintercepted fetch so
 *   tests can never accidentally hit the live Productive API.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  fetch as undiciFetch,
  type Dispatcher,
} from 'undici';

process.env.NODE_ENV = 'test';

// Stub dotenv so `src/config/index.ts` cannot read a real `.env` file. The
// vitest config `env` block already supplies the required variables. The
// stub is hoisted because `vi.mock` runs before any imports.
vi.mock('dotenv', () => ({
  config: () => ({ parsed: {} }),
  default: { config: () => ({ parsed: {} }) },
}));

// Node's built-in `fetch` is wired to a SEPARATE undici instance bundled with
// the runtime. Calls to the userland `setGlobalDispatcher` only affect the
// userland undici, so the built-in fetch ignores our MockAgent.
//
// Workaround: replace `globalThis.fetch` with the userland `undici.fetch`
// which DOES respect `setGlobalDispatcher`. This makes `MockAgent` reliable
// across the entire test suite.
const originalFetch = globalThis.fetch;
(globalThis as { fetch: typeof undiciFetch }).fetch = undiciFetch;

let originalDispatcher: Dispatcher | undefined;
let activeAgent: MockAgent | undefined;

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  activeAgent = new MockAgent();
  activeAgent.disableNetConnect();
  setGlobalDispatcher(activeAgent);
});

afterEach(async () => {
  if (activeAgent) {
    await activeAgent.close();
  }
  if (originalDispatcher) {
    setGlobalDispatcher(originalDispatcher);
  }
  activeAgent = undefined;
  originalDispatcher = undefined;
});

// Make the original (real) fetch reachable for any test that needs it. Tests
// almost never need this; it's wired up for completeness so a misbehaving
// test can be diagnosed.
export const __originalFetch = originalFetch;
