# @modelcontextprotocol/sdk 1.27.x — TypeScript stdio MCP server reference

> Ground truth: all signatures extracted from
> `node_modules/@modelcontextprotocol/sdk/dist/esm/*.d.ts` (SDK v1.27.1, installed 2025-05-06).

---

## 1. Summary

`@modelcontextprotocol/sdk` 1.27.x is the official TypeScript implementation of the Model Context
Protocol. The 1.27 generation introduces the stable `McpServer` high-level API (replacing the older
`Server` + manual `setRequestHandler` dispatch), structured output schemas on tools
(`outputSchema` / `structuredContent`), `ResourceLink` content blocks, form- and URL-based
elicitation, and the Streamable HTTP transport for remote deployments. The project is currently on
the low-level `Server` path; migrating to `McpServer` eliminates the large `switch (name)` dispatch
and gives type-safe registration with automatic capability advertisement.

---

## 2. Installation & versions

```bash
npm install @modelcontextprotocol/sdk zod
```

The project pins `"@modelcontextprotocol/sdk": "^1.27.1"` and `"zod": "^3.25.67"`.

The SDK internally imports from `zod/v4` but maintains full backward compatibility with **Zod v3.25+**
via the `zod-compat` shim layer (`server/zod-compat.d.ts`). You can pass either Zod v3 or v4 schemas
to `registerTool`, `registerResource`, and `registerPrompt`.

Protocol versions advertised by this SDK:

```typescript
// from types.d.ts
export declare const LATEST_PROTOCOL_VERSION = "2025-11-25";
export declare const DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26";
export declare const SUPPORTED_PROTOCOL_VERSIONS: string[]; // ["2025-11-25", "2025-03-26", "2024-11-05"]
```

---

## 3. McpServer setup vs low-level Server

### Before (current project pattern — low-level Server)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

// Manual capability dispatch — grows with every new tool
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [myToolDefinition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case 'my_tool':
      return myToolHandler(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### After (McpServer high-level API)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// McpServer constructor: (serverInfo: Implementation, options?: ServerOptions)
const server = new McpServer(
  { name: 'my-server', version: '1.0.0' },
  {
    capabilities: { tools: {}, prompts: {}, resources: {} },
    instructions: 'Optional human-readable description of the server.',
  }
);

// Each registerTool / registerResource / registerPrompt call auto-updates
// the capabilities and routing — no switch statement needed.
server.registerTool(
  'my_tool',
  {
    title: 'My Tool',
    description: 'Does something useful.',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => ({
    content: [{ type: 'text', text: `Result for: ${query}` }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Key differences:

| | `Server` (low-level) | `McpServer` (high-level) |
|---|---|---|
| Routing | Manual `switch(name)` | Automatic |
| Capability advertisement | Manual `capabilities` object | Auto-derived |
| Input validation | Manual | Automatic via Zod schema |
| Output validation | Manual | Automatic when `outputSchema` provided |
| Notification helpers | `server.sendToolListChanged()` etc. | Same, via `mcpServer.server` |

The underlying `Server` instance is always accessible as `mcpServer.server` for advanced operations
like `createMessage`, `elicitInput`, and `sendLoggingMessage`.

---

## 4. Registering tools — title, annotations, inputSchema, outputSchema, structuredContent

### Signature (from `server/mcp.d.ts`)

```typescript
registerTool<
  OutputArgs extends ZodRawShapeCompat | AnySchema,
  InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined
>(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
  },
  cb: ToolCallback<InputArgs>
): RegisteredTool
```

`ToolCallback` returns `CallToolResult | Promise<CallToolResult>`.

`CallToolResult` (from `types.d.ts`):

```typescript
type CallToolResult = {
  content: ContentBlock[];   // default []
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: { ... };
};
```

### Example: read-only tool returning structured data

```typescript
import { z } from 'zod';

server.registerTool(
  'get_project',
  {
    title: 'Get Project',
    description: 'Fetches a single Productive project by ID.',
    inputSchema: {
      project_id: z.string().describe('Productive project ID'),
    },
    outputSchema: {
      id: z.string(),
      name: z.string(),
      status: z.enum(['active', 'archived']),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      title: 'Get Project',
    },
    _meta: { 'x-productive-entity': 'project' },
  },
  async ({ project_id }) => {
    const project = await apiClient.getProject(project_id);
    return {
      // content is optional when outputSchema is set, but recommended for
      // clients that don't support structuredContent
      content: [{ type: 'text', text: `Project: ${project.name}` }],
      structuredContent: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
    };
  }
);
```

### Important: `outputSchema` triggers automatic server-side validation

When `outputSchema` is provided, `McpServer` validates `structuredContent` against the schema before
sending the response. If validation fails, the server returns an error result automatically.

### Updating or removing a registered tool at runtime

```typescript
const tool = server.registerTool('my_tool', config, handler);

// Enable/disable without removing
tool.disable();
tool.enable();

// Update metadata and notify clients
tool.update({ title: 'New Title', description: 'Updated desc' });
// McpServer sends tools/listChanged notification automatically

// Remove entirely
tool.remove();
```

---

## 5. Registering resources — static + ResourceTemplate

### Static resource

```typescript
// Signature:
// registerResource(
//   name: string,
//   uriOrTemplate: string,
//   config: ResourceMetadata,
//   readCallback: ReadResourceCallback
// ): RegisteredResource
//
// ResourceMetadata = Omit<Resource, 'uri' | 'name'>
// ReadResourceCallback = (uri: URL, extra: RequestHandlerExtra) => ReadResourceResult | Promise<ReadResourceResult>

server.registerResource(
  'server-config',
  'productive://config',
  {
    title: 'Server Configuration',
    description: 'Current server runtime configuration.',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify({ version: '1.0.0', env: 'production' }),
      },
    ],
  })
);
```

### Dynamic resource via ResourceTemplate

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// ResourceTemplate constructor:
// new ResourceTemplate(
//   uriTemplate: string | UriTemplate,
//   callbacks: {
//     list: ListResourcesCallback | undefined;   // REQUIRED (even if undefined)
//     complete?: { [variable: string]: CompleteResourceTemplateCallback };
//   }
// )

const projectTemplate = new ResourceTemplate(
  'productive://projects/{projectId}',
  {
    list: async (extra) => ({
      resources: await apiClient.listProjects().then(projects =>
        projects.map(p => ({
          uri: `productive://projects/${p.id}`,
          name: p.name,
          mimeType: 'application/json',
        }))
      ),
    }),
    complete: {
      projectId: async (value) => {
        const projects = await apiClient.listProjects();
        return projects
          .filter(p => p.id.startsWith(value) || p.name.toLowerCase().includes(value.toLowerCase()))
          .map(p => p.id);
      },
    },
  }
);

// registerResource overload for templates:
// registerResource(
//   name: string,
//   uriOrTemplate: ResourceTemplate,
//   config: ResourceMetadata,
//   readCallback: ReadResourceTemplateCallback
// ): RegisteredResourceTemplate
//
// ReadResourceTemplateCallback = (uri: URL, variables: Variables, extra: RequestHandlerExtra) => ReadResourceResult

server.registerResource(
  'project',
  projectTemplate,
  {
    title: 'Productive Project',
    description: 'A single project resource.',
    mimeType: 'application/json',
  },
  async (uri, { projectId }) => {
    const project = await apiClient.getProject(String(projectId));
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(project),
        },
      ],
    };
  }
);
```

---

## 6. Registering prompts with completion handlers

### Signature (from `server/mcp.d.ts`)

```typescript
registerPrompt<Args extends PromptArgsRawShape>(
  name: string,
  config: {
    title?: string;
    description?: string;
    argsSchema?: Args;
  },
  cb: PromptCallback<Args>
): RegisteredPrompt

// PromptCallback = (args: ShapeOutput<Args>, extra: RequestHandlerExtra) => GetPromptResult | Promise<GetPromptResult>
```

### Using `completable` for argument completions (from `server/completable.d.ts`)

```typescript
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';

// completable<T extends AnySchema>(
//   schema: T,
//   complete: (value: SchemaInput<T>, context?: { arguments?: Record<string, string> }) => SchemaInput<T>[] | Promise<SchemaInput<T>[]>
// ): CompletableSchema<T>

server.registerPrompt(
  'timesheet',
  {
    title: 'Timesheet Summary',
    description: 'Generates a timesheet summary for a given project and period.',
    argsSchema: {
      project_id: completable(
        z.string().describe('Project ID'),
        async (partialValue) => {
          const projects = await apiClient.listProjects();
          return projects
            .filter(p => p.id.includes(partialValue) || p.name.toLowerCase().includes(partialValue.toLowerCase()))
            .map(p => p.id);
        }
      ),
      period: completable(
        z.enum(['this_week', 'last_week', 'this_month', 'last_month']),
        () => ['this_week', 'last_week', 'this_month', 'last_month']
      ),
    },
  },
  async ({ project_id, period }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a timesheet summary for project ${project_id} for ${period}.`,
        },
      },
    ],
  })
);
```

`McpServer` detects `completable` schemas automatically via the `COMPLETABLE_SYMBOL` property and
registers a `completion/complete` handler for the prompt.

---

## 7. Elicitation — form and URL flows

Elicitation requires the underlying `Server` instance (`mcpServer.server`).

### Elicit user input via a structured form

```typescript
// Server.elicitInput signature:
// elicitInput(
//   params: ElicitRequestFormParams | ElicitRequestURLParams,
//   options?: RequestOptions
// ): Promise<ElicitResult>
//
// ElicitResult = {
//   action: 'accept' | 'decline' | 'cancel';
//   content?: Record<string, string | number | boolean | string[]>;
// }

// ElicitRequestFormParams fields:
//   mode?: 'form'           (optional — 'form' is the default)
//   message: string
//   requestedSchema: {
//     type: 'object';
//     properties: Record<string, PrimitiveSchemaDefinition>;
//     required?: string[];
//   }
//   task?: { ttl?: number }

server.registerTool(
  'create_time_entry',
  {
    title: 'Create Time Entry',
    description: 'Creates a time entry, prompting for missing fields.',
    inputSchema: { task_id: z.string() },
  },
  async ({ task_id }, extra) => {
    const result = await extra.server.elicitInput({
      message: 'Please provide time entry details.',
      requestedSchema: {
        type: 'object',
        properties: {
          hours: {
            type: 'number',
            title: 'Hours',
            description: 'Number of hours to log',
            minimum: 0.25,
            maximum: 24,
          },
          note: {
            type: 'string',
            title: 'Note',
            description: 'What did you work on?',
            maxLength: 500,
          },
          date: {
            type: 'string',
            title: 'Date',
            format: 'date',
          },
        },
        required: ['hours', 'date'],
      },
    });

    if (result.action !== 'accept' || !result.content) {
      return { content: [{ type: 'text', text: 'Time entry creation cancelled.' }] };
    }

    const entry = await apiClient.createTimeEntry({
      task_id,
      hours: Number(result.content['hours']),
      note: String(result.content['note'] ?? ''),
      date: String(result.content['date']),
    });

    return { content: [{ type: 'text', text: `Created time entry ${entry.id}` }] };
  }
);
```

Note: `extra.server` is available in `RequestHandlerExtra` for direct access to the underlying
`Server` when using `McpServer`. Alternatively, keep a reference to `mcpServer.server`.

### Accessing `Server.elicitInput` from within a tool handler

`ToolCallback` receives `(args, extra: RequestHandlerExtra<ServerRequest, ServerNotification>)`.
`RequestHandlerExtra` does not directly expose `elicitInput`. You must use a closure over the
`mcpServer.server` reference:

```typescript
const mcpServer = new McpServer({ name: 'my-server', version: '1.0.0' });

mcpServer.registerTool('my_tool', { ... }, async (args, _extra) => {
  const result = await mcpServer.server.elicitInput({ ... });
  // ...
});
```

### Elicitation field type constraints

`requestedSchema.properties` values must be one of these MCP-defined primitive schema types:

| Type | Fields |
|------|--------|
| `{ type: 'string', minLength?, maxLength?, format?: 'date'\|'uri'\|'email'\|'date-time' }` | Free text |
| `{ type: 'string', enum: string[], enumNames?: string[] }` | Single-select dropdown |
| `{ type: 'string', oneOf: [{const, title}][] }` | Single-select with labels |
| `{ type: 'boolean' }` | Checkbox |
| `{ type: 'number'\|'integer', minimum?, maximum? }` | Numeric |
| `{ type: 'array', items: { enum: string[] }, minItems?, maxItems? }` | Multi-select |
| `{ type: 'array', items: { anyOf: [{const, title}][] } }` | Multi-select with labels |

### URL-based elicitation flow

Used for secure flows (OAuth, API key entry, payment) that must happen in a browser.

```typescript
// ElicitRequestURLParams fields:
//   mode: 'url'           (REQUIRED to distinguish from form)
//   message: string
//   elicitationId: string   (server-generated, stable ID for this elicitation)
//   url: string             (the URL to open in the browser)

import { randomUUID } from 'node:crypto';

const elicitationId = randomUUID();

// Send the URL elicitation
const result = await mcpServer.server.elicitInput({
  mode: 'url',
  message: 'Please authenticate with Productive.io to continue.',
  elicitationId,
  url: `https://app.productive.io/oauth/authorize?state=${elicitationId}`,
});

// After the user completes the flow and the callback arrives, send completion:
const notifier = mcpServer.server.createElicitationCompletionNotifier(elicitationId);
await notifier(); // sends notifications/elicitation/complete
```

### `UrlElicitationRequiredError` (error-based URL elicitation)

When a tool cannot proceed without a URL elicitation, throw `UrlElicitationRequiredError` with
error code `ErrorCode.UrlElicitationRequired` (-32042):

```typescript
import { UrlElicitationRequiredError } from '@modelcontextprotocol/sdk/types.js';

throw new UrlElicitationRequiredError(
  [
    {
      mode: 'url',
      message: 'API key required',
      elicitationId: randomUUID(),
      url: 'https://app.productive.io/settings/api-keys',
    },
  ],
  'Authentication required to use this tool.'
);
```

### Error codes

```typescript
// ErrorCode enum (types.d.ts)
enum ErrorCode {
  ConnectionClosed        = -32000,
  RequestTimeout          = -32001,
  ParseError              = -32700,
  InvalidRequest          = -32600,
  MethodNotFound          = -32601,
  InvalidParams           = -32602,
  InternalError           = -32603,
  UrlElicitationRequired  = -32042,   // URL elicitation required
}
```

### Fallback when client doesn't support elicitation

Not all clients advertise `elicitation` capability. Check before calling:

```typescript
const caps = mcpServer.server.getClientCapabilities();
if (!caps?.elicitation) {
  // Fall back: return an error content block asking user to provide the data
  return {
    content: [{ type: 'text', text: 'Please provide hours and date as arguments.' }],
    isError: true,
  };
}
const result = await mcpServer.server.elicitInput({ ... });
```

---

## 8. ResourceLinks in tool output

`ResourceLink` is a `ContentBlock` variant with `type: 'resource_link'`. It references a resource
URI that the client can independently read, rather than inlining the content.

### ResourceLink schema (from `types.d.ts`)

```typescript
// ResourceLinkSchema fields:
//   type: 'resource_link'   (REQUIRED)
//   uri: string             (REQUIRED)
//   name: string            (REQUIRED — display name)
//   title?: string
//   description?: string
//   mimeType?: string
//   annotations?: { audience?: ('user'|'assistant')[], priority?: number, lastModified?: string }
//   _meta?: Record<string, unknown>
//   icons?: { src: string, mimeType?: string, sizes?: string[], theme?: 'light'|'dark' }[]
```

### Example: return a resource link from a tool

```typescript
server.registerTool(
  'get_project_resource',
  {
    title: 'Get Project Resource',
    description: 'Returns a link to the project resource for further reading.',
    inputSchema: { project_id: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ project_id }) => {
    const project = await apiClient.getProject(project_id);
    return {
      content: [
        {
          type: 'text',
          text: `Found project "${project.name}".`,
        },
        {
          type: 'resource_link',
          uri: `productive://projects/${project_id}`,
          name: project.name,
          title: `Project: ${project.name}`,
          description: `Full project details for ${project.name}`,
          mimeType: 'application/json',
        },
      ],
    };
  }
);
```

The client can then call `resources/read` on the returned URI to get full project data without the
tool having to inline all fields.

---

## 9. StreamableHTTP transport (Express-style)

For remote deployments. The `StdioServerTransport` is used for local process-spawned integrations;
`StreamableHTTPServerTransport` wraps the Web Standard transport for Node.js HTTP.

### Session-based (stateful) server

```typescript
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// StreamableHTTPServerTransportOptions (= WebStandardStreamableHTTPServerTransportOptions):
//   sessionIdGenerator?: () => string      — omit for stateless mode
//   onsessioninitialized?: (sessionId: string) => void | Promise<void>
//   onsessionclosed?: (sessionId: string) => void | Promise<void>
//   enableJsonResponse?: boolean           — return JSON instead of SSE
//   eventStore?: EventStore                — enables resumability
//   retryInterval?: number                 — SSE retry hint (ms)

const sessions = new Map<string, StreamableHTTPServerTransport>();

const app = express();
app.use(express.json());

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (req.method === 'POST' && !sessionId) {
    // New session — create transport + server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });

    const server = new McpServer({ name: 'my-server', version: '1.0.0' });
    // register tools, resources, prompts here...
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Existing session
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ error: 'Missing session ID' });
});

app.listen(3000);
```

### Stateless mode

```typescript
// sessionIdGenerator: undefined → no session ID, no validation
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});
```

In stateless mode every request is independent. Useful for serverless/edge environments.

### Auth middleware

`handleRequest` accepts an `IncomingMessage & { auth?: AuthInfo }`. Attach auth info via middleware:

```typescript
app.use('/mcp', (req, _res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    (req as typeof req & { auth?: AuthInfo }).auth = { token, scopes: [], clientId: '' };
  }
  next();
});
```

`AuthInfo` is then available in tool handlers via `extra.authInfo` (the `MessageExtraInfo` field).

---

## 10. Tool annotations — full reference

From `types.d.ts` / `ToolAnnotationsSchema`:

```typescript
type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};
```

All properties are **hints only**. Clients must not make security decisions based on them.

| Annotation | Default | Meaning |
|---|---|---|
| `title` | — | Human-readable display name for the tool (shown in UIs) |
| `readOnlyHint` | `false` | Tool does not modify state. Pure reads (list, get, search). |
| `destructiveHint` | `true` | Tool may perform irreversible destructive actions (delete, overwrite). Set `false` for safe write operations. |
| `idempotentHint` | `false` | Calling the tool multiple times with the same args has the same effect as calling it once. |
| `openWorldHint` | `true` | Tool may interact with external entities not controlled by the server (APIs, external services). Set `false` for purely local, bounded tools. |

### Recommended annotation patterns for this project

```typescript
// Read-only, safe to call repeatedly
annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false }

// Write operation, non-destructive (create)
annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }

// Destructive operation (delete, hard override)
annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }

// Create-or-update (upsert)
annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
```

`title` in annotations is separate from the top-level `title` field in `registerTool` config.
Prefer the top-level `title` for display name; the `annotations.title` field is a legacy hint that
some clients may read. Both can be set simultaneously.

---

## 11. Gotchas

### Zod v3 vs v4 schema compatibility

The SDK uses `zod/v4` internally (via `import * as z from 'zod/v4'` in `types.d.ts`). Your project
uses `zod` v3.25.x. The `zod-compat.d.ts` shim handles both:

```typescript
type AnySchema = z3.ZodTypeAny | z4.$ZodType;
type ZodRawShapeCompat = Record<string, AnySchema>;
```

This means `{ field: z.string() }` (Zod v3 imported from `'zod'`) works correctly in
`inputSchema`, `outputSchema`, and `argsSchema`. Do **not** mix v3 and v4 schemas within a single
`ZodRawShapeCompat` object — the compat layer handles each schema individually.

The `toJsonSchemaCompat` function (`server/zod-json-schema-compat.d.ts`) converts Zod schemas to
JSON Schema for the wire format. Do not call it manually; `McpServer` calls it internally.

### ESM import paths

The package uses named subpath exports. Always use the `.js` extension in import paths:

```typescript
// Correct
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Types + schemas (avoid unless needed for low-level work)
import type { CallToolResult, ToolAnnotations, ResourceLink } from '@modelcontextprotocol/sdk/types.js';
```

### `outputSchema` vs `content`

When `outputSchema` is set on a tool, `McpServer` validates `structuredContent` automatically.
The `content` array is still strongly recommended for backward compatibility with clients that do
not support `structuredContent`. Both fields can coexist in the same result object.

### Capabilities must be advertised

`McpServer` with `capabilities: {}` or `capabilities: { tools: {} }` is sufficient for tool use.
`McpServer` auto-registers `tools`, `resources`, `prompts` capabilities when you call
`registerTool` / `registerResource` / `registerPrompt` — you do not need to pre-declare them if
you use the high-level API. Elicitation is a **client** capability (`capabilities.elicitation`),
not a server capability; check `getClientCapabilities()` before calling `elicitInput`.

### `completable` wraps the schema symbol

```typescript
import { completable, isCompletable, getCompleter } from '@modelcontextprotocol/sdk/server/completable.js';

const schema = completable(z.string(), async (val) => ['option1', 'option2']);
// schema has COMPLETABLE_SYMBOL property
// McpServer detects this automatically — no extra registration needed
```

### Error code -32042 (UrlElicitationRequired)

This error code is defined in the SDK's `ErrorCode` enum and also has the dedicated
`UrlElicitationRequiredError` class. Clients that implement the MCP spec will catch this error
and surface the URL to the user.

### `_meta` on tools, resources, prompts

`_meta` on a `RegisteredTool` is `Record<string, unknown>`. It is wire-transmitted to clients as
part of the tool definition. Use reverse-DNS keys to avoid collisions:
`'x-productive-entity': 'task'`.

---

## 12. Testing patterns — in-memory transport

Use `InMemoryTransport.createLinkedPair()` to connect a server and client in the same process
without any network I/O.

```typescript
// server/mcp.d.ts, inMemory.d.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// InMemoryTransport.createLinkedPair(): [InMemoryTransport, InMemoryTransport]
// Returns [clientTransport, serverTransport]

describe('get_project tool', () => {
  it('returns project data', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });

    server.registerTool(
      'get_project',
      {
        title: 'Get Project',
        inputSchema: { project_id: z.string() },
        annotations: { readOnlyHint: true },
      },
      async ({ project_id }) => ({
        content: [{ type: 'text', text: `Project ${project_id}` }],
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'get_project',
      arguments: { project_id: 'proj-123' },
    });

    expect(result.content[0]).toEqual({ type: 'text', text: 'Project proj-123' });

    await server.close();
    await client.close();
  });
});
```

### Testing elicitation (mock the server method)

```typescript
const server = new McpServer({ name: 'test', version: '0.0.0' });
const elicitSpy = vi.spyOn(server.server, 'elicitInput').mockResolvedValue({
  action: 'accept',
  content: { hours: 2, date: '2025-05-06' },
});

// ... register and call the tool, assert elicitSpy was called
```

---

## 13. References

- Installed package: `/Users/ruben/Developer/productive-mcp/node_modules/@modelcontextprotocol/sdk`
- High-level server API: `dist/esm/server/mcp.d.ts`
- Low-level server: `dist/esm/server/index.d.ts`
- All types and schemas: `dist/esm/types.d.ts`
- Completable helper: `dist/esm/server/completable.d.ts`
- Zod compat shim: `dist/esm/server/zod-compat.d.ts`
- JSON Schema conversion: `dist/esm/server/zod-json-schema-compat.d.ts`
- Stdio transport: `dist/esm/server/stdio.d.ts`
- Streamable HTTP (Node.js): `dist/esm/server/streamableHttp.d.ts`
- Streamable HTTP (Web Standard): `dist/esm/server/webStandardStreamableHttp.d.ts`
- In-memory transport: `dist/esm/inMemory.d.ts`
- Official MCP spec: https://modelcontextprotocol.io/specification/draft
- SDK README: `/Users/ruben/Developer/productive-mcp/node_modules/@modelcontextprotocol/sdk/README.md`
