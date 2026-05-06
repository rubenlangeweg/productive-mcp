/**
 * `confirmAction` — shared elicitation-aware confirmation helper for
 * destructive tools.
 *
 * Behaviour, in order:
 *   1. `dryRun: true` → never executes; returns `{ proceed: false, reason: 'dry_run' }`.
 *   2. `confirmed: true` → caller already collected explicit consent; returns
 *      `{ proceed: true }` without prompting.
 *   3. Otherwise, attempts an `elicitation/create` request via
 *      `extra.sendRequest`. Maps the user's action:
 *        - `accept` + `confirmed === true` → `{ proceed: true }`
 *        - `accept` + `confirmed !== true` → `{ proceed: false, reason: 'declined' }`
 *        - `decline` → `{ proceed: false, reason: 'declined' }`
 *        - `cancel`  → `{ proceed: false, reason: 'cancelled' }`
 *   4. If the elicitation request throws (capability not advertised, transport
 *      rejects with MethodNotFound, etc.) the helper falls back to
 *      `{ proceed: true }` so callers can continue with their own dry-run /
 *      confirm-flag fallback contract.
 *
 * Designed for read-modify-write tools where the model has already gathered
 * inputs and needs final user consent before persisting.
 */
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';

/** Options for {@link confirmAction}. */
export interface ConfirmOptions {
  /** Human-readable description of the destructive action. */
  message: string;
  /** When true, skip the action entirely and report what would have happened. */
  dryRun?: boolean;
  /** When true, treat the action as already confirmed (skip elicitation). */
  confirmed?: boolean;
}

/** Outcome of {@link confirmAction}. */
export type ConfirmResult =
  | { proceed: true }
  | { proceed: false; reason: 'dry_run' | 'declined' | 'cancelled' };

/**
 * Subset of `RequestHandlerExtra` we actually rely on. Accepting a structural
 * type makes the helper trivial to unit-test without spinning up the full
 * MCP request lifecycle.
 */
export type ConfirmExtra = Pick<
  RequestHandlerExtra<ServerRequest, ServerNotification>,
  'sendRequest'
>;

/**
 * Ask the user to confirm a destructive action via MCP elicitation.
 *
 * @param extra  Request handler extra carrying `sendRequest`. In a real tool
 *               this is the second argument supplied to `ToolCallback`.
 * @param options Confirmation options (message + dry-run / confirmed flags).
 */
export async function confirmAction(
  extra: ConfirmExtra,
  options: ConfirmOptions
): Promise<ConfirmResult> {
  if (options.dryRun === true) {
    return { proceed: false, reason: 'dry_run' };
  }

  if (options.confirmed === true) {
    return { proceed: true };
  }

  const elicitRequest = {
    method: 'elicitation/create' as const,
    params: {
      message: options.message,
      requestedSchema: {
        type: 'object' as const,
        properties: {
          confirmed: {
            type: 'boolean' as const,
            title: 'Confirm',
            description:
              'Check to confirm. Leave unchecked to abort the operation.',
          },
        },
        required: ['confirmed'],
      },
    },
  };

  let result;
  try {
    result = await extra.sendRequest(elicitRequest, ElicitResultSchema);
  } catch {
    // Elicitation unsupported (no capability) or transport-level failure.
    // Caller is expected to gate destructive work behind its own
    // dry-run / confirm flag, so it is safe to proceed here.
    return { proceed: true };
  }

  if (result.action === 'accept') {
    const confirmed = result.content?.['confirmed'];
    if (confirmed === true) {
      return { proceed: true };
    }
    return { proceed: false, reason: 'declined' };
  }

  if (result.action === 'decline') {
    return { proceed: false, reason: 'declined' };
  }

  return { proceed: false, reason: 'cancelled' };
}
