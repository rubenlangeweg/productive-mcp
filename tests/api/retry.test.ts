/**
 * Tests for `withRetry` and `parseRetryAfter`.
 *
 * Verifies VAL-FOUNDATION-006 (429 honours Retry-After, 3 retries) and
 * VAL-FOUNDATION-007 (5xx exponential backoff up to 3 attempts).
 */
import { describe, it, expect } from 'vitest';
import { parseRetryAfter, withRetry } from '../../src/api/retry.js';

class FakeResponse {
  readonly status: number;
  readonly ok = false;
  readonly headers: Headers;
  constructor(status: number, headers: Record<string, string> = {}) {
    this.status = status;
    this.headers = new Headers(headers);
  }
  async text(): Promise<string> {
    return '';
  }
}

describe('parseRetryAfter', () => {
  it('parses integer seconds to milliseconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('1.5')).toBe(1500);
  });

  it('parses HTTP-date to a positive offset', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30000);
  });

  it('returns 0 for past dates', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', now)).toBe(0);
  });

  it('returns null for null/empty/garbage', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('not-a-date')).toBeNull();
  });
});

describe('withRetry — 429 + Retry-After', () => {
  it('retries up to 3 times, sleeping for the Retry-After value', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fn = async () => {
      calls += 1;
      if (calls < 3) {
        throw new FakeResponse(429, { 'retry-after': '1' });
      }
      return 'ok';
    };

    const result = await withRetry(fn, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('throws the final 429 when retries are exhausted', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new FakeResponse(429, { 'retry-after': '0' });
    };

    let caught: unknown;
    try {
      await withRetry(fn, {
        maxAttempts: 3,
        sleep: async () => undefined,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FakeResponse);
    expect((caught as FakeResponse).status).toBe(429);
    expect(calls).toBe(3);
  });

  it('uses HTTP-date Retry-After header', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fn = async () => {
      calls += 1;
      if (calls === 1) {
        const future = new Date(Date.now() + 250).toUTCString();
        throw new FakeResponse(429, { 'retry-after': future });
      }
      return 'ok';
    };

    await withRetry(fn, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toHaveLength(1);
    // Allow timing slack: parsed delay should be roughly 0..1000ms; we just
    // require it falls in a sane bound.
    expect(sleeps[0]).toBeGreaterThanOrEqual(0);
    expect(sleeps[0]).toBeLessThanOrEqual(1500);
  });
});

describe('withRetry — 5xx exponential backoff', () => {
  it('retries 5xx with exponential backoff up to maxAttempts', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fn = async () => {
      calls += 1;
      throw new FakeResponse(503);
    };

    let caught: unknown;
    try {
      await withRetry(fn, {
        maxAttempts: 4,
        baseDelayMs: 100,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
    } catch (err) {
      caught = err;
    }

    // 4 attempts = initial + 3 retries → 3 sleeps before final throw
    expect(calls).toBe(4);
    expect(sleeps).toEqual([100, 200, 400]);
    expect(caught).toBeInstanceOf(FakeResponse);
  });

  it('returns successfully if a later attempt succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls < 3) throw new FakeResponse(500);
      return 'ok';
    };
    const result = await withRetry(fn, {
      baseDelayMs: 10,
      sleep: async () => undefined,
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
});

describe('withRetry — non-retriable', () => {
  it('does not retry on 4xx (other than 429)', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new FakeResponse(401);
    };

    let caught: unknown;
    try {
      await withRetry(fn, { sleep: async () => undefined });
    } catch (err) {
      caught = err;
    }
    expect(calls).toBe(1);
    expect((caught as FakeResponse).status).toBe(401);
  });

  it('does not retry non-Response errors', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      throw new TypeError('boom');
    };

    let caught: unknown;
    try {
      await withRetry(fn, { sleep: async () => undefined });
    } catch (err) {
      caught = err;
    }
    expect(calls).toBe(1);
    expect(caught).toBeInstanceOf(TypeError);
  });
});

describe('withRetry — integration with Core via 5xx then 200', () => {
  // This test confirms the retry loop also works when wired through Core's
  // exec function (which throws the raw Response on non-2xx).
  it('retries until success when wrapping a fetch-style call', async () => {
    const responses = [
      new FakeResponse(503),
      new FakeResponse(503),
      'success',
    ];
    let i = 0;
    const fn = async () => {
      const r = responses[i++];
      if (r instanceof FakeResponse) throw r;
      return r;
    };
    const result = await withRetry(fn, {
      baseDelayMs: 1,
      sleep: async () => undefined,
    });
    expect(result).toBe('success');
  });
});
