/**
 * Tests for `confirmAction` — the elicitation-aware confirmation helper.
 *
 * Verifies the four documented decision branches:
 *   1. `dryRun` short-circuits with `reason: 'dry_run'`.
 *   2. `confirmed` short-circuits with `proceed: true` and never elicits.
 *   3. A throwing `sendRequest` falls back to `proceed: true`.
 *   4. Each user-driven action (`accept` w/ + w/o confirm, `decline`,
 *      `cancel`) maps to the documented `ConfirmResult`.
 */
import { describe, it, expect, vi } from 'vitest';
import { confirmAction, type ConfirmExtra } from '../../src/elicit/confirm.js';

function makeExtra(
  send: ConfirmExtra['sendRequest']
): ConfirmExtra {
  return { sendRequest: send };
}

describe('confirmAction', () => {
  it('returns dry_run without eliciting when dryRun=true', async () => {
    const send = vi.fn();
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
      dryRun: true,
    });

    expect(result).toEqual({ proceed: false, reason: 'dry_run' });
    expect(send).not.toHaveBeenCalled();
  });

  it('proceeds without eliciting when confirmed=true', async () => {
    const send = vi.fn();
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
      confirmed: true,
    });

    expect(result).toEqual({ proceed: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('falls back to proceed=true when elicitation throws (unsupported)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Method not found'));
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
    });

    expect(result).toEqual({ proceed: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('proceeds when user accepts with confirmed=true', async () => {
    const send = vi.fn().mockResolvedValue({
      action: 'accept',
      content: { confirmed: true },
    });
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
    });

    expect(result).toEqual({ proceed: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [request] = send.mock.calls[0]!;
    expect(request).toMatchObject({
      method: 'elicitation/create',
      params: {
        message: 'Delete task 1?',
        requestedSchema: {
          type: 'object',
          required: ['confirmed'],
        },
      },
    });
  });

  it('declines when user accepts but leaves the box unchecked', async () => {
    const send = vi.fn().mockResolvedValue({
      action: 'accept',
      content: { confirmed: false },
    });
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
    });

    expect(result).toEqual({ proceed: false, reason: 'declined' });
  });

  it('maps explicit decline action to declined', async () => {
    const send = vi.fn().mockResolvedValue({ action: 'decline' });
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
    });

    expect(result).toEqual({ proceed: false, reason: 'declined' });
  });

  it('maps cancel action to cancelled', async () => {
    const send = vi.fn().mockResolvedValue({ action: 'cancel' });
    const result = await confirmAction(makeExtra(send), {
      message: 'Delete task 1?',
    });

    expect(result).toEqual({ proceed: false, reason: 'cancelled' });
  });
});
