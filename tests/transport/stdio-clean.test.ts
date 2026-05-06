/**
 * @fileoverview Stdio cleanliness regression test.
 *
 * The production runtime (`createServer` in `src/server.ts`) attaches a
 * `StdioServerTransport`, which means stdout is the JSON-RPC framing channel
 * for the MCP protocol. Any stray `console.log`, `process.stdout.write`, or
 * `print`-style call from server code corrupts that stream and breaks every
 * downstream MCP client (Claude Desktop, mcp-inspector, etc.).
 *
 * This test exercises a normal MCP session over the in-memory transport and
 * spies on `process.stdout.write` / `process.stderr.write`. The in-memory
 * transport never touches `process.stdout`, so any recorded write is by
 * definition a leak from server, tool, or registration code.
 *
 * Covers VAL-TRANSPORT-001 (stdio stream stays clean during a session).
 */
import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../../src/server.js';
import { withFetchMock } from '../helpers/withFetchMock.js';

/**
 * Encode a write argument the way Node would: Buffer/Uint8Array → utf8 string,
 * everything else → its string form. Used purely to build a readable failure
 * message when a stray write is detected.
 */
function describeWrite(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
  return String(chunk);
}

describe('stdio cleanliness', () => {
  it('writes nothing to stdout during a normal MCP session', async () => {
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];

    // `mockImplementation` swallows the call so any accidental log noise from
    // server code never reaches the real terminal during the test run.
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        stdoutWrites.push(describeWrite(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        stderrWrites.push(describeWrite(chunk));
        return true;
      });

    try {
      // `whoami` hits `/people/{user}` to resolve the configured user; the
      // mock returns a minimal JSON:API payload so the call succeeds without
      // touching the network.
      await withFetchMock(
        [
          {
            path: /\/api\/v2\/people\/.*/,
            body: {
              data: {
                id: 'test-user',
                type: 'people',
                attributes: { first_name: 'Test', last_name: 'User', email: 't@example.com' },
              },
            },
          },
        ],
        async () => {
          const server = buildServer();
          const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair();

          const client = new Client(
            { name: 'stdio-clean-test', version: '0.0.1' },
            { capabilities: { tools: {}, prompts: {}, resources: {} } }
          );

          // initialize handshake
          await server.connect(serverTransport);
          await client.connect(clientTransport);

          // listTools — exercises the registration surface.
          const tools = await client.listTools();
          expect(tools.tools.length).toBeGreaterThan(0);

          // tools/call whoami — exercises a real handler end-to-end.
          const whoamiResult = await client.callTool({
            name: 'whoami',
            arguments: {},
          });
          expect(whoamiResult).toBeDefined();

          // Clean teardown so close handlers also have a chance to leak.
          await client.close();
          await server.close();
        }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }

    // The in-memory transport never calls `process.stdout.write`, so any
    // captured chunk indicates a stray log somewhere in the server path.
    if (stdoutWrites.length > 0) {
      // Surface the offending content in the assertion message — without it,
      // tracking down the call site is painful.
      expect.fail(
        `Expected zero stdout writes during MCP session, got ${stdoutWrites.length}:\n` +
          stdoutWrites.map((w, i) => `  [${i}] ${JSON.stringify(w)}`).join('\n')
      );
    }
    expect(stdoutSpy).not.toHaveBeenCalled();

    // stderr is allowed for diagnostics but we record it so a future test can
    // tighten the contract if needed. No assertion today — keep this test
    // focused on the stdio framing channel.
    void stderrWrites;
  });
});
