/**
 * Smoke tests for the Vitest + undici harness.
 *
 * Verifies VAL-FOUNDATION-010 (no live calls), VAL-FOUNDATION-012 (dotenv
 * guarded for tests).
 */
import { describe, it, expect } from 'vitest';
import { withFetchMock } from './helpers/withFetchMock.js';

describe('test harness', () => {
  it('intercepts fetch via undici MockAgent', async () => {
    await withFetchMock(
      [{ path: '/api/v2/ping', body: { ok: true } }],
      async () => {
        const response = await fetch('https://api.productive.io/api/v2/ping');
        expect(response.status).toBe(200);
        const data = (await response.json()) as { ok: boolean };
        expect(data.ok).toBe(true);
      }
    );
  });

  it('rejects unintercepted fetches', async () => {
    // The global setup installs a MockAgent with `disableNetConnect()`. Any
    // unmocked fetch should throw.
    await expect(
      fetch('https://api.productive.io/api/v2/never-mocked')
    ).rejects.toThrow();
  });

  it('forces NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('does not leak production .env values into config', async () => {
    // The vitest config sets PRODUCTIVE_API_TOKEN=test-token. If dotenv ran,
    // a developer's local .env could overwrite that. The guard in
    // src/config/index.ts prevents that.
    const { getConfig } = await import('../src/config/index.js');
    const cfg = getConfig();
    expect(cfg.PRODUCTIVE_API_TOKEN).toBe('test-token');
    expect(cfg.PRODUCTIVE_ORG_ID).toBe('test-org');
  });
});
