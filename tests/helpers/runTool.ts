/**
 * Convenience wrapper for invoking a tool handler directly without the MCP
 * protocol overhead. Tests get a pre-wired API client and a stable test
 * config so they only have to worry about arguments and assertions.
 */
import { ProductiveAPIClient } from '../../src/api/client.js';
import type { Config } from '../../src/config/index.js';

export const TEST_CONFIG: Config = {
  PRODUCTIVE_API_TOKEN: 'test-token',
  PRODUCTIVE_ORG_ID: 'test-org',
  PRODUCTIVE_USER_ID: 'test-user',
  PRODUCTIVE_API_BASE_URL: 'https://api.productive.io/api/v2/',
};

export function makeTestClient(): ProductiveAPIClient {
  return new ProductiveAPIClient(TEST_CONFIG);
}

export type ToolContent = { type: string; text: string };
export type ToolResult = {
  content: ToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

/** Tool handler signature variants encountered in the codebase. */
type Handler1 = (client: ProductiveAPIClient, args: unknown) => Promise<ToolResult>;
type Handler2 = (
  client: ProductiveAPIClient,
  args: unknown,
  config: Config
) => Promise<ToolResult>;
type Handler3 = (
  client: ProductiveAPIClient,
  config: Config,
  args: unknown
) => Promise<ToolResult>;

/**
 * Call a tool handler with a fresh test client. Pass either signature
 * variant — the helper inspects the function arity at call time.
 */
export async function runTool(
  handler: Handler1 | Handler2 | Handler3,
  args: unknown,
  options?: { configFirst?: boolean; client?: ProductiveAPIClient }
): Promise<ToolResult> {
  const client = options?.client ?? makeTestClient();
  if (options?.configFirst) {
    return (handler as Handler3)(client, TEST_CONFIG, args);
  }
  // Try with config arg; handlers that accept only two args will ignore it.
  if (handler.length >= 3) {
    return (handler as Handler2)(client, args, TEST_CONFIG);
  }
  return (handler as Handler1)(client, args);
}
