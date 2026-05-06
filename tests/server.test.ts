/**
 * End-to-end tests for the McpServer-based bootstrap in `src/server.ts`.
 *
 * These tests use the in-memory transport pair to drive a real MCP client
 * against the same registration code path used by the stdio runtime, without
 * spawning a subprocess or hitting the network.
 *
 * Verifies VAL-MCP-001 (every tool registers via McpServer.registerTool) and
 * VAL-MCP-010 (server advertises the expected capability set).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

describe('McpServer bootstrap', () => {
  let cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups = [];
  });

  it('advertises capabilities', async () => {
    const handle = await createTestServer();
    cleanups.push(handle.cleanup);

    // The MCP client surfaces the server's advertised capabilities after the
    // initialize handshake completes.
    const capabilities = handle.client.getServerCapabilities();

    expect(capabilities).toBeDefined();
    // Must advertise tools, resources, and prompts so MCP clients can route
    // requests to the corresponding handlers.
    expect(capabilities?.tools).toBeDefined();
    expect(capabilities?.resources).toBeDefined();
    expect(capabilities?.prompts).toBeDefined();
    // Elicitation capability must NOT be advertised yet — it is wired up in
    // a separate M2 feature once the elicitation helper exists.
    expect(capabilities).not.toHaveProperty('elicitation');
  });

  it('lists all 30 tools', async () => {
    const handle = await createTestServer();
    cleanups.push(handle.cleanup);

    const result = await handle.client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    // Project floor: the server has carried at least 30 tools since the
    // dispatch-switch era. Anything below this count means a registration
    // was dropped during the McpServer migration.
    expect(toolNames.length).toBeGreaterThanOrEqual(30);

    // Spot-check well-known names so a regression that swaps the registry
    // (e.g. for an empty tool list) fails loudly.
    for (const name of [
      'whoami',
      'list_projects',
      'list_tasks',
      'create_task',
      'list_time_entries',
    ]) {
      expect(toolNames).toContain(name);
    }

    // Every tool must carry a name and an inputSchema (even an empty object).
    for (const tool of result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });
});
