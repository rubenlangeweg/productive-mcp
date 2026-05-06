/**
 * Retry-with-backoff for the Productive API client.
 *
 * Productive does not document a global rate limit. The two endpoints with
 * documented limits (contracts: 50 req/min, salaries: 30 req/2min) may emit
 * 429s in practice; sporadic 5xx responses also occur. This module wraps any
 * fetch-style operation in:
 *
 * - 429 → honour `Retry-After` header (seconds OR HTTP-date), max attempts
 * - 5xx → exponential backoff with jitter (1s / 2s / 4s by default)
 * - 4xx (other) → no retry; the caller surfaces the error as-is
 *
 * The retried function MUST reject with the raw `Response` object on
 * non-2xx responses so we can introspect the status. Other errors propagate
 * unchanged.
 */
import { isResponseLike } from './response-utils.js';

export interface RetryOptions {
  /** Maximum total attempts (initial + retries). Default 4 (= 3 retries). */
  maxAttempts?: number;
  /** Base delay for exponential backoff on 5xx (ms). Default 1000. */
  baseDelayMs?: number;
  /** Cap any single sleep at this duration (ms). Default 30_000. */
  maxDelayMs?: number;
  /** Optional sleep override for tests (default `setTimeout`). */
  sleep?: (ms: number) => Promise<void>;
  /** Optional jitter factor (0..1). Default 0 in tests; tiny otherwise. */
  jitter?: number;
}

const DEFAULTS: Required<Omit<RetryOptions, 'sleep'>> = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitter: 0,
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Parse the `Retry-After` response header per RFC 7231:
 * - integer seconds (e.g. "120"), or
 * - HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT").
 *
 * Returns milliseconds to wait, or `null` if the header is absent / unparseable.
 */
export function parseRetryAfter(
  headerValue: string | null,
  now: number = Date.now()
): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  // Integer seconds path
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(Number.parseFloat(trimmed) * 1000));
  }
  // HTTP-date path
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - now);
}

/**
 * Wrap a fetch operation in retry-with-backoff. The operation MUST throw
 * the raw `Response` on non-2xx responses; other errors are not retried.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  const sleep = options?.sleep ?? defaultSleep;

  let attempt = 0;
  let lastError: unknown;
  while (attempt < opts.maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Only Response-shaped failures are inspected; anything else is fatal.
      if (!isResponseLike(err)) {
        throw err;
      }
      const response = err;
      if (!isRetriableStatus(response.status)) {
        throw err;
      }
      if (attempt >= opts.maxAttempts) {
        throw err;
      }

      let delayMs: number;
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(
          response.headers.get('retry-after')
        );
        delayMs =
          retryAfter !== null
            ? retryAfter
            : opts.baseDelayMs * 2 ** (attempt - 1);
      } else {
        // 5xx — exponential backoff with optional jitter
        const base = opts.baseDelayMs * 2 ** (attempt - 1);
        const jitter =
          opts.jitter > 0 ? Math.random() * opts.jitter * base : 0;
        delayMs = base + jitter;
      }
      delayMs = Math.min(delayMs, opts.maxDelayMs);

      // Drain the body so the connection can be reused.
      try {
        if (typeof (response as Response).text === 'function') {
          await (response as Response).text();
        }
      } catch {
        /* swallow */
      }

      await sleep(delayMs);
      continue;
    }
  }
  // Unreachable in normal flow; the loop returns or throws.
  throw lastError ?? new Error('withRetry: exhausted retries');
}
