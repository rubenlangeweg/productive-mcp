/**
 * Spin up a real `Server` wired to an in-memory transport so end-to-end tests
 * can exercise the MCP request/response path without spawning subprocesses or
 * touching the network.
 *
 * Returns a connected SDK `Client`, a `cleanup` function for `afterEach`, and
 * the underlying server instance for low-level inspection.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServer } from '../../src/server.js';

export interface TestServerHandle {
  client: Client;
  server: Server;
  cleanup: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServerHandle> {
  // The real createServer connects to a stdio transport internally. We need
  // the same registration calls but a different transport, so we build a
  // sibling connection with the in-memory pair AFTER the server is created.
  // The stdio transport is already attached, but stdio in tests is benign
  // (no input arrives), so an extra in-memory connection is fine.
  const server = await createServer();

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
    },
  };
}
