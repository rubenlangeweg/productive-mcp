/**
 * Spin up a real `McpServer` wired to an in-memory transport so end-to-end
 * tests can exercise the MCP request/response path without spawning
 * subprocesses or touching the network.
 *
 * Returns a connected SDK `Client`, a `cleanup` function for `afterEach`,
 * and the underlying server instance for low-level inspection.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildServer } from '../../src/server.js';

export interface TestServerHandle {
  client: Client;
  server: McpServer;
  cleanup: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServerHandle> {
  // `buildServer()` registers every tool/prompt/resource but does NOT
  // attach a transport, so the in-memory pair below is the server's only
  // transport — the SDK's protocol enforces a single transport per server.
  const server = buildServer();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'productive-mcp-test-client', version: '0.0.1' },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    server,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}
