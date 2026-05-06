/**
 * Tiny helpers shared between `core.ts` and `retry.ts` to avoid an import
 * cycle.
 */

/**
 * Duck-type check for a `Response`-like object.
 *
 * Node's built-in `Response` and undici's `Response` are distinct classes
 * (the user-installed undici does not share its prototype with the runtime's
 * bundled fetch). Identify by structural traits instead.
 */
export function isResponseLike(value: unknown): value is Response {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as { status: unknown }).status === 'number' &&
    'headers' in value &&
    'ok' in value
  );
}
