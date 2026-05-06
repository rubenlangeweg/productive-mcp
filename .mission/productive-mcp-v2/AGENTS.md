# AGENTS.md — Productive MCP v2

> Shared knowledge for every worker agent on this mission. Read before starting any feature.

## Project at a glance

- **Repo:** `/Users/ruben/Developer/productive-mcp`
- **Package:** `productive-mcp-rb2` (npm), originally forked from `berwickgeek/productive-mcp`
- **Stack:** Node 18+ ESM, TypeScript 5.8 strict, Zod 3.25, `@modelcontextprotocol/sdk@^1.27.1`
- **Transport:** stdio (current); StreamableHTTP added in M7
- **Build:** `npm run build` → `tsc` emits `build/` and chmods `build/index.js`
- **Test:** added in M1 — `npm test` (vitest) + `npm test -- --coverage`
- **Type-check only:** `npm run build` (there is no separate `type-check` script today; M1 may add one)

## Boundaries

**In scope for this mission:**
- Anything under `src/`, `tests/`, mission docs in `.mission/productive-mcp-v2/`
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/workflows/*.yml`
- New top-level docs: `CHANGELOG.md`, `MIGRATION.md`
- README updates (M7)

**Off-limits:**
- `api-master.yaml` — reference only, never modify
- `build/` — generated, never hand-edit
- `.beads/` — bd state, manipulated only by `bd` CLI commands
- `node_modules/` — managed by npm
- Any file under `.claude/` — IDE config, not part of the mission

## Conventions

### Code

- **TypeScript strict mode** — `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all on. Compiler errors are blocking.
- **No `any`.** Use `unknown` for truly unknown shapes and narrow with Zod.
- **No `@ts-ignore` / `@ts-expect-error`.**
- **ESM** — `"type": "module"`; imports use `.js` extension (TypeScript resolves to `.ts`).
- **Files under 500 lines.** Tool files preferably under 200. Split when approaching.
- **No `console.log`** in production code paths (corrupts stdio transport). `console.error` allowed only for fatal startup errors before transport connects.
- **Tool names** — `snake_case` matching Productive's resource families (e.g. `list_approval_policies` not `listApprovalPolicies`).
- **Type names** — `PascalCase` matching the Productive resource (e.g. `ApprovalPolicy`).

### Naming patterns

| Concept | Pattern | Example |
|---------|---------|---------|
| Resource family module | `src/api/resources/<resource>.ts` | `src/api/resources/approval_policies.ts` |
| Tool handler module | `src/tools/<resource>.ts` (or `<family>/<tool>.ts` for big families like reports) | `src/tools/reports/time-entries.ts` |
| Zod input schema | `<toolName>InputSchema` | `listCompaniesInputSchema` |
| Zod output schema | `<toolName>OutputSchema` | `listCompaniesOutputSchema` |
| Handler factory | `<toolName>Handler` | `listCompaniesHandler` |
| Tool config object | `<toolName>Config` | `listCompaniesConfig` |
| Test fixture | `tests/fixtures/<resource>/<scenario>.json` | `tests/fixtures/approval_policies/active.json` |

### Response shape rules

Every tool returns:
```typescript
{
  content: [
    { type: 'text', text: <markdown summary, ≥30 chars when non-empty> },
    // optional: { type: 'resource_link', uri, name } for create-flows
  ],
  structuredContent: <object validated against outputSchema>,
}
```

For empty results, still return both `content[0].text` ("No <resource> found matching <criteria>.") and `structuredContent` (e.g. `{ items: [], total: 0 }`).

### Error mapping

Use `McpError` from `@modelcontextprotocol/sdk/types.js`. Map Productive HTTP statuses to MCP error codes:

| Productive status | MCP `ErrorCode` |
|-------------------|-----------------|
| 401 | InternalError (with "Authentication failed" in message) |
| 403 | InternalError (with "Permission denied") |
| 404 | InvalidParams (with "Not found: …") |
| 422 | InvalidParams (with full detail) |
| 429 | InternalError (after retries exhausted) |
| 500/502/503/504 | InternalError (after retries exhausted) |
| Zod parse failure | InvalidParams |
| User did not confirm in elicitation | InvalidParams ("Confirmation required") |

The shared `mapApiError(response)` helper in `src/api/core.ts` does this. Tools MUST NOT catch and rethrow — they let the helper propagate.

## Services

- **Productive API** — base URL configurable via `PRODUCTIVE_API_BASE_URL` (defaults to `https://api.productive.io/api/v2/`). All requests need `X-Auth-Token` and `X-Organization-Id` headers — `core.ts` does this.
- **Test mock** — `undici` MockAgent intercepts `fetch` globally. See `tests/helpers/withFetchMock.ts` (added in M1).
- **Dev server** — there is no dev server; the MCP runs on stdio. Use the `@modelcontextprotocol/inspector` tool to manually exercise builds:
  ```bash
  npm run build
  npx @modelcontextprotocol/inspector node ./build/index.js
  ```
- **Healthcheck** — for HTTP transport (M7), `GET /healthz` returns 200 OK + the package version.

## Environment variables

| Var | Required | Default | Used in |
|-----|----------|---------|---------|
| `PRODUCTIVE_API_TOKEN` | yes | — | core.ts |
| `PRODUCTIVE_ORG_ID` | yes | — | core.ts |
| `PRODUCTIVE_USER_ID` | no | — | enables "me" references in tools |
| `PRODUCTIVE_API_BASE_URL` | no | `https://api.productive.io/api/v2/` | core.ts |
| `MCP_TRANSPORT` | no (M7+) | `stdio` | bootstrap |
| `MCP_HTTP_PORT` | no (M7+) | `8731` | http transport |
| `MCP_HTTP_BEARER_TOKEN` | no (M7+) | — | http auth middleware |
| `NODE_ENV` | no | — | tests use `test`; dotenv guard checks this |

Adding a new env var requires updating BOTH this table AND `README.md`.

## Testing guidance

- **Use `undici` MockAgent**, not `msw`. The `core.ts` request layer uses the global `fetch` directly; MockAgent intercepts via `getGlobalDispatcher` / `setGlobalDispatcher`. See `tests/helpers/withFetchMock.ts`.
- **Fixture-first.** When adding a tool, capture a real fixture before writing the test. Sanitize PII before commit.
- **Snapshot the tool surface.** `tests/server-snapshot.test.ts` snapshots the registered tools (names + annotations + outputSchema). When you add a tool, regenerate the snapshot intentionally.
- **In-memory transport for end-to-end.** `@modelcontextprotocol/sdk/inMemory.js` is already vendored. See `tests/helpers/runTool.ts`.
- **Coverage thresholds.** `lines: 80`, `branches: 75` enforced by vitest config. Don't drop them.
- **Don't import the real config.** Tests bring up the server with hardcoded test config so dotenv never runs. See `tests/helpers/createTestServer.ts`.
- **Schema parity test exists.** `tests/server-schema-parity.test.ts` runs every tool with a stub fixture and asserts `outputSchema.parse(structuredContent)` succeeds. Adding a tool that doesn't match its outputSchema breaks this — fix the schema or the handler, don't loosen the test.

## bd workflow

- `bd show <id> --json` before starting; confirm all `blocks` deps are closed
- `bd update <id> --claim` to atomically claim (sets assignee + status `in_progress`)
- On completion: orchestrator appends your handoff to notes; do NOT run `bd update` to close — orchestrator handles it after handoff is verified
- Commit message prefix: `<bd-id>: <description>` — match the bd issue ID exactly
- If you spot work that needs a new bd issue (scrutiny finding, follow-up), record it under "Discovered Issues" in your handoff — orchestrator creates the bd issue

## Known gotchas

These are mistakes you'll hit if you don't read carefully:

1. **Productive `boards` and `folders` are aliased** — both `/boards` and `/folders` point at the same resource. Pick one (we use `boards`) and document.
2. **`deals` includes both deals and budgets.** Filter on `attributes.budget === true` for budgets, `false` for deals. Existing `get_budget_burn` does this — match the pattern.
3. **`task.attributes.status` is a number on POST, but responses use `task.attributes.closed: boolean`.** The current code is wrong; M1 fixes it. Don't replicate the old pattern.
4. **JSON:API includes are sideloaded under `included`, not nested in relationships.** Use the `IncludeResolver` from `src/api/include-resolver.ts`.
5. **Money is in cents.** `budget_total: 100000` means €1,000.00. Convert when displaying.
6. **Pagination is page-based, not cursor.** `links.next` is a URL we follow; we don't construct a new query.
7. **`reposition` endpoints have undefined request bodies in the spec.** Read existing `taskRepositionTool` for the working shape; don't re-derive from the spec.
8. **`deleted_items` is a recycle bin, not a query modifier.** Soft-deleted resources don't appear in normal lists; they appear in `/deleted_items`.
9. **`/sessions`, `/passwords`, `/invitations` are out of scope.** Do not add tools for them.
10. **Spec defects:** `salary_reports` filter has `annuall_cost` (typo); some filter schemas have duplicate `id` fields. Workers should use the spelling Productive accepts (test against fixtures), and add a comment in the source noting the spec defect.
11. **Productive does not document rate limits centrally.** Only `contracts POST` (50/min) and `salaries PATCH/POST` (30 / 2min) are documented. Our retry logic (M1) handles 429 generically — document the conservative behaviour in `core.ts`.
12. **Stdout is sacred on stdio transport.** Don't `console.log`. The `dotenv` config silences itself in `src/config/index.ts` already; preserve that.
13. **Building before tests.** Tests don't require `npm run build` — they import `src/` directly via vitest's TS support. But CI runs build first to catch type errors not caught by vitest.

## Cross-references

- Mission goals + scope: `mission.md`
- Every assertion that must hold: `validation-contract.md`
- Per-worker procedure: `skills/<worker>/SKILL.md`
- Inter-worker contract: `INTERFACES.md`
- External tech notes: `library/<topic>.md`
  - `library/mcp-sdk-1.27.md` — McpServer + structured + elicitation + completion + ResourceLinks + StreamableHTTP
  - `library/productive-api.md` — JSON:API conventions, auth, pagination, includes, errors
  - `library/productive-reports.md` — 24 report endpoints
  - `library/productive-approvals-and-finance.md` — approvals, bills, payments, POs, line items, invoice lifecycle, tax/exchange rates, org structure
  - `library/testing-vitest-fixtures.md` — Vitest setup, MockAgent, fixture pattern
