# Validation Contract — Productive MCP v2

> Single source of truth for "done." Every behaviour the v2 release must exhibit is captured here as a `VAL-AREA-NNN` assertion with a tool and evidence. Every feature in the bd graph fulfills at least one assertion; every assertion is fulfilled by at least one feature.

Areas:
- `VAL-FOUNDATION` — bug fixes, client refactor, retry, paginate, include resolver, test harness (M1)
- `VAL-MCP` — McpServer, structuredContent, outputSchema, elicitation, completion, ResourceLinks (M2)
- `VAL-REPORTS` — 24 report tools (M3)
- `VAL-APPROVE` — approval policies + workflows + assignments + time/expense approve flows (M4 part 1)
- `VAL-FINANCE` — bills, payments, purchase orders, line items, invoice lifecycle, tax rates (M4 part 2)
- `VAL-ORG` — subsidiaries, teams, holidays, roles, custom fields, tags (M5 part 1)
- `VAL-RESOURCING` — resource_requests, project_assignments, placeholders, salaries, rate_cards (M5 part 2)
- `VAL-KNOWLEDGE` — pages CRUD/copy/move/append/publish, page_versions, sections, folders, document_types (M6 part 1)
- `VAL-PIPELINE` — deal lifecycle, deal_statuses, lost_reasons, contracts, proposals, dashboards, pipelines (M6 part 2)
- `VAL-COMM` — discussions, comment reactions/pin, notifications, pulses, emails (M6 part 3)
- `VAL-TRANSPORT` — StreamableHTTP transport (M7)
- `VAL-RELEASE` — versioning, CHANGELOG, MIGRATION, npm publish flow (M7)
- `VAL-CROSS` — cross-cutting (error handling consistency, no console output on stdio, dotenv guard)

Every tool asserted below must be invocable via the MCP host and return both `content[0].text` AND `structuredContent` matching its registered `outputSchema` (this is the M2 baseline; later milestones inherit it).

---

## VAL-FOUNDATION

### VAL-FOUNDATION-001: Server version matches package.json

The MCP `initialize` response advertises `serverInfo.version` equal to the `version` field in `package.json`. No hardcoded `'1.0.0'`.

**Tool:** vitest (e2e via `InMemoryTransport`)
**Evidence:** `tests/server.test.ts` — `it('advertises package.json version')` calls `server.initialize` and asserts `result.serverInfo.version === pkg.version`.

### VAL-FOUNDATION-002: No tool re-imports config

Every file in `src/tools/` receives `client` and `config` via parameters. No tool calls `getConfig()` or constructs its own `fetch` request.

**Tool:** ripgrep
**Evidence:** `rg "getConfig\(\)" src/tools/` returns 0 lines. `rg "^const url = " src/tools/` returns 0 lines.

### VAL-FOUNDATION-003: Time-entries tool handler renamed

The handler exported from `src/tools/time-entries.ts` is `listTimeEntriesTool` (correct spelling). `listTimeEntresTool` does not exist anywhere in the codebase.

**Tool:** ripgrep
**Evidence:** `rg "listTimeEntres" src/` returns 0. `rg "listTimeEntriesTool" src/` returns ≥1.

### VAL-FOUNDATION-004: list_tasks status display reads `closed`

`list_tasks` and `get_project_tasks` derive task status from `attributes.closed` (boolean), not `attributes.status` (number).

**Tool:** vitest
**Evidence:** `tests/tools/tasks.test.ts` — fixture has `closed: false`, no `status` attribute; tool output text contains "Status: open" and structuredContent has `status: 'open'`.

### VAL-FOUNDATION-005: API client modules under 200 LOC

`src/api/core.ts` and every `src/api/resources/<name>.ts` is under 200 lines. No file in `src/` exceeds 500 lines.

**Tool:** wc -l + ripgrep
**Evidence:** CI step `find src/api/resources -name "*.ts" -exec wc -l {} +` — every count <200. `find src -name "*.ts" -exec wc -l {} +` — every count <500.

### VAL-FOUNDATION-006: 429 honors Retry-After

Core client retries on HTTP 429 up to 3 times, sleeping for the duration in `Retry-After` header (seconds). On the 4th 429, it surfaces an `McpError` with code `RateLimited`.

**Tool:** vitest with MockAgent
**Evidence:** `tests/api/retry.test.ts` — mock returns 429 + `Retry-After: 1` twice then 200; tool succeeds with 2 retries observed and 1+1+0s delay observed (within tolerance).

### VAL-FOUNDATION-007: 5xx retried with exponential backoff

Core client retries on HTTP 500/502/503/504 up to 3 times with backoff (e.g. 200ms, 500ms, 1.5s + jitter). On the 4th 5xx, surfaces a normal `McpError`.

**Tool:** vitest with MockAgent
**Evidence:** `tests/api/retry.test.ts` — mock returns 503 four times; tool throws after exactly 3 retry attempts (4 total fetches).

### VAL-FOUNDATION-008: List endpoints auto-paginate by default

For any list-collection tool (e.g. `list_projects`, `list_tasks`), if `meta.total_count > page_size`, the client follows `links.next` until exhausted (or hits a safety cap of 1000 items unless overridden by `limit`).

**Tool:** vitest with MockAgent
**Evidence:** `tests/api/paginate.test.ts` — mock returns 3 pages of 200, `total_count: 600`; client returns 600 items with 3 fetches observed.

### VAL-FOUNDATION-009: JSON:API `included` resolved into resolved object

When a tool requests `include=person,service`, the helper builds an indexed `included` map keyed by `${type}:${id}`, and exposes a `resolve()` method on the response.

**Tool:** vitest
**Evidence:** `tests/api/include-resolver.test.ts` — fixture has 1 booking with `relationships.person.data.id: "42"` and `included: [{ type: 'people', id: '42', attributes: { first_name: 'Marthin' } }]`; the resolver returns the full person object when `resolve('people', '42')` is called.

### VAL-FOUNDATION-010: Vitest passes with no live calls

`npm test` runs the full suite without ever issuing a real HTTP request. MockAgent intercepts every `fetch` call.

**Tool:** vitest with MockAgent in `connect: true` mode
**Evidence:** `tests/setup.ts` calls `setGlobalDispatcher(new MockAgent({ connect: false }))`; any unmocked fetch fails the test. CI: `npm test -- --coverage` exits 0.

### VAL-FOUNDATION-011: Test coverage ≥80% lines

`npm test -- --coverage` reports `lines: ≥80%` and `branches: ≥75%` overall. Generated/dispatch glue is excluded.

**Tool:** vitest coverage
**Evidence:** `vitest.config.ts` has `coverage.thresholds.lines: 80`, `branches: 75`. CI fails if thresholds drop.

### VAL-FOUNDATION-012: dotenv guarded for tests

Test environment never loads `.env`. Production loads it once at import time without writing to stdout.

**Tool:** vitest
**Evidence:** `tests/config.test.ts` — sets `NODE_ENV=test`, asserts `getConfig` does not call `dotenv.config()` (spy on it). Stdout capture during config import is empty.

### VAL-FOUNDATION-013: build directory not committed (or rebuilt fresh on publish)

Either `build/` is in `.gitignore` AND the npm publish workflow runs `npm run build` AND the published tarball contains a fresh `build/` — OR `build/` stays committed and is regenerated on every change with a CI check.

**Tool:** git + npm workflow
**Evidence:** `.github/workflows/npm-publish.yml` runs `npm ci && npm run build` before `npm publish`. (Either choice is acceptable; document which in README.)

### VAL-FOUNDATION-014: `listBookings` filter params unified

Calls to `listBookings` accept `after` / `before` (matching every other list endpoint), and the client internally translates to whatever Productive expects.

**Tool:** vitest
**Evidence:** `tests/tools/bookings.test.ts` — calling tool with `after: '2026-01-01'` triggers a fetch with the correct Productive query param.

### VAL-FOUNDATION-015: Consistent error mapping

Every tool, on any failure, surfaces an `McpError` with appropriate `ErrorCode`. No tool returns `{ content: [{ type: 'text', text: 'Error: …' }] }` as a fallback.

**Tool:** vitest + ripgrep
**Evidence:** `rg "Error: \\$\\{.*\\.message\\}" src/tools/` returns 0 lines. `tests/error-mapping.test.ts` covers 401, 403, 404, 422, 429, 500 → expected `ErrorCode` values.

### VAL-FOUNDATION-016: Per-resource API modules exist

`src/api/resources/` exists with one file per resource family covered. Each module exports typed functions that take a `Core` and return parsed data.

**Tool:** ripgrep + tree
**Evidence:** `ls src/api/resources/` — at least 30 files (one per resource family currently exposed). Each exports at least one function and imports from `../core`.

---

## VAL-MCP

### VAL-MCP-001: Server uses McpServer high-level API

`src/server.ts` imports `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and registers each tool via `server.registerTool(name, config, handler)`. No `setRequestHandler(CallToolRequestSchema, …)` switch.

**Tool:** ripgrep
**Evidence:** `rg "CallToolRequestSchema" src/` returns 0 outside test files. `rg "registerTool" src/server.ts` returns ≥30.

### VAL-MCP-002: Every tool has outputSchema and structuredContent

For every registered tool, the `registerTool` config includes `outputSchema`, and the handler returns a `structuredContent` object that validates against it. McpServer validates this automatically on send.

**Tool:** vitest
**Evidence:** `tests/tools/structured-output.test.ts` iterates over all registered tools; calls each with mocked fetches; asserts `structuredContent` is present and parses cleanly via the registered Zod outputSchema.

### VAL-MCP-003: Every tool has a text content block matching the structured data

Every tool also returns `content: [{ type: 'text', text: <human-readable summary> }]` in addition to `structuredContent`. The text block is the polished version of the current behaviour.

**Tool:** vitest
**Evidence:** Same suite as MCP-002 — also asserts `result.content[0].type === 'text'` and `result.content[0].text.length > 0`.

### VAL-MCP-004: Every tool has appropriate annotations

Every tool's `annotations` object sets at least `readOnlyHint` (true for list/get, false for create/update/delete) and `title`. Destructive tools also set `destructiveHint: true`. Idempotent updates set `idempotentHint: true`.

**Tool:** vitest
**Evidence:** `tests/tools/annotations.test.ts` — assertion table per tool name → expected annotations.

### VAL-MCP-005: Destructive tools gate on elicitation + dry_run

Every tool that creates, updates, or deletes data accepts a `dry_run: boolean` arg. When `dry_run: true`, the tool returns the planned request body in `structuredContent` and a "would …" text summary, without making the call. When `dry_run: false` (default) AND the host supports elicitation, the tool calls `elicitation/create` with a confirmation form before executing. If the host doesn't advertise elicitation capability, the tool requires `confirm: true` arg as a fallback.

**Tool:** vitest
**Evidence:** `tests/tools/elicitation.test.ts` — `create_time_entry` with `dry_run: true` returns no fetch; without `dry_run`, calls `elicitation/create` (mocked); without elicitation capability + no `confirm`, throws `McpError(InvalidParams, "confirmation required")`.

### VAL-MCP-006: Prompts have completion handlers on suitable args

Prompts whose args reference Productive entities (e.g. `project_id`, `person_id`) wrap those args with `completable()` so MCP hosts can autocomplete from live data.

**Tool:** vitest
**Evidence:** `tests/prompts/completion.test.ts` — calling `completion/complete` with `ref: { type: 'ref/prompt', name: 'weekly_report' }` and `argument: { name: 'person_id', value: 'mar' }` returns at least one match like "Marthin".

### VAL-MCP-007: ResourceLinks returned where natural

`create_task`, `create_time_entry`, `create_page` (and other create-flows) return a `ResourceLink` content block in addition to text/structured, pointing at e.g. `productive://tasks/<id>`.

**Tool:** vitest
**Evidence:** `tests/tools/create-task.test.ts` — `result.content` includes one `{ type: 'resource_link', uri: 'productive://tasks/<id>', name: 'Task: <title>' }`.

### VAL-MCP-008: rb2 constants exposed as resources

The MCP advertises resources `productive://rb2/subsidiaries`, `productive://rb2/rate-cards`, `productive://rb2/service-types`, `productive://rb2/teams` returning the maps from `src/config/rb2.ts`.

**Tool:** vitest
**Evidence:** `tests/resources/rb2.test.ts` — `resources/list` returns these URIs; `resources/read` on each returns the full mapping in JSON form.

### VAL-MCP-009: Resource templates registered

`productive://projects/{project_id}/tasks` and `productive://tasks/{task_id}` are registered via `ResourceTemplate` (not just `match` regex inside a handler).

**Tool:** vitest
**Evidence:** `resources/list` response contains `resourceTemplates[*].uriTemplate` entries matching exactly these strings.

### VAL-MCP-010: capabilities advertised correctly

The MCP `initialize` response declares the right capabilities: `tools.listChanged: true`, `resources.listChanged: true`, `resources.subscribe: false`, `prompts.listChanged: true`, `elicitation: {}` advertised when adopted, `completion: {}` advertised.

**Tool:** vitest
**Evidence:** `tests/server.test.ts` — `it('advertises capabilities')` reads the initialize result and matches a snapshot.

---

## VAL-REPORTS

For each of the 24 report endpoints, ONE assertion proves the tool is wired correctly. They share a common shape, listed once below and applied to each.

### VAL-REPORTS-{01..24}: report_<resource>_reports tools work

For each report tool name in M3 (24 total), the tool:
1. Accepts the documented filter, group, and sort params per `library/productive-reports.md`
2. Issues exactly one GET to the matching `/api/v2/reports/<name>` path with the params translated to JSON:API `filter[*]`, `group`, `sort`
3. Returns `structuredContent` matching its `outputSchema` (`{ rows: [], grouping: { by, dimensions } }`)
4. Returns a markdown table in `content[0].text` for the first 20 rows
5. Has `readOnlyHint: true` annotation

**Tool:** vitest with fixtures captured from real Productive responses (one per report)
**Evidence:** `tests/tools/reports/<name>.test.ts` per tool — fixture-driven assertion matching the above 5 conditions.

### VAL-REPORTS-COVERAGE: All 24 reports registered

`server.registerTool` is called with each of the 24 report names listed in `mission.md` §3.

**Tool:** vitest
**Evidence:** `tests/server-registry.test.ts` — assert the registered tool names superset includes all 24.

---

## VAL-APPROVE

### VAL-APPROVE-001: Approval policies CRUD

`list_approval_policies`, `get_approval_policy`, `create_approval_policy`, `archive_approval_policy`, `restore_approval_policy` are registered and round-trip a fixture policy.

**Tool:** vitest
**Evidence:** `tests/tools/approvals.test.ts` — create returns id; get with that id returns the same shape; archive then restore returns to active.

### VAL-APPROVE-002: Approval workflows

`list_approval_workflows`, `save_approval_workflow` are registered. Save handles both create and update in JSON:API style.

**Tool:** vitest
**Evidence:** Same suite — create then update via save.

### VAL-APPROVE-003: Approval policy assignments

`list_approval_policy_assignments`, `save_approval_policy_assignment` are registered.

**Tool:** vitest
**Evidence:** Same suite.

### VAL-APPROVE-004: Time entry single-approve

`approve_time_entry` calls `PATCH /time_entries/{id}/approve`. Returns the updated entry. Has `destructiveHint: false, idempotentHint: true`.

**Tool:** vitest
**Evidence:** `tests/tools/time-entry-approve.test.ts` — fixture entry with `approval_status: pending`; after tool call, `approval_status: approved`.

### VAL-APPROVE-005: Time entry bulk-approve via filter

`bulk_approve_time_entries` calls `PATCH /time_entries/approve` with a filter body specifying which entries to approve (per `library/productive-approvals-and-finance.md`). Requires elicitation confirmation OR `confirm: true` + `dry_run: false`.

**Tool:** vitest
**Evidence:** `tests/tools/time-entry-bulk-approve.test.ts` — `dry_run: true` returns the constructed filter body without calling; with `confirm: true`, the PATCH is observed.

### VAL-APPROVE-006: Time entry reject + unapprove + unreject

`reject_time_entry`, `unapprove_time_entry`, `unreject_time_entry` registered and gated.

**Tool:** vitest
**Evidence:** Same suite.

### VAL-APPROVE-007: Expense approve flows

`approve_expense`, `bulk_approve_expenses` (uses explicit `ids: [...]` body), `reject_expense`, `unapprove_expense`, `unreject_expense` registered. Bulk requires elicitation/dry_run.

**Tool:** vitest
**Evidence:** `tests/tools/expense-approvals.test.ts`.

---

## VAL-FINANCE

### VAL-FINANCE-001: Bills CRUD

`list_bills`, `get_bill`, `create_bill`, `update_bill` registered and shape-validated.

**Tool:** vitest
**Evidence:** `tests/tools/bills.test.ts`.

### VAL-FINANCE-002: Payments CRUD

`list_payments`, `get_payment`, `create_payment` registered.

**Tool:** vitest
**Evidence:** `tests/tools/payments.test.ts`.

### VAL-FINANCE-003: Purchase orders CRUD + actions

`list_purchase_orders`, `get_purchase_order`, `create_purchase_order`, `send_purchase_order` registered. `send_purchase_order` requires elicitation confirmation.

**Tool:** vitest
**Evidence:** `tests/tools/purchase-orders.test.ts`.

### VAL-FINANCE-004: Line items + generate

`list_line_items`, `generate_line_items` registered. Generate calls `POST /line_items/generate` and returns the generated items.

**Tool:** vitest
**Evidence:** `tests/tools/line-items.test.ts`.

### VAL-FINANCE-005: Invoice lifecycle

`finalize_invoice` (locks invoice — destructive, elicitation), `send_invoice` (emails — destructive, elicitation), `preview_invoice` (read-only) registered.

**Tool:** vitest
**Evidence:** `tests/tools/invoices.test.ts` — finalize gated on elicitation; send gated on elicitation; preview is read-only.

### VAL-FINANCE-006: Tax rates + exchange rates + invoice templates + payment reminder sequences

`list_tax_rates`, `list_exchange_rates`, `list_invoice_templates`, `list_payment_reminder_sequences` registered as read-only.

**Tool:** vitest
**Evidence:** `tests/tools/finance-misc.test.ts`.

---

## VAL-ORG

### VAL-ORG-001: Subsidiaries
`list_subsidiaries` returns the org's subsidiaries with id, name, currency.
**Tool:** vitest. **Evidence:** `tests/tools/subsidiaries.test.ts`.

### VAL-ORG-002: Teams + memberships
`list_teams`, `get_team`, `list_team_memberships` registered.
**Tool:** vitest. **Evidence:** `tests/tools/teams.test.ts`.

### VAL-ORG-003: Holidays + calendars
`list_holidays`, `list_holiday_calendars` registered.
**Tool:** vitest. **Evidence:** `tests/tools/holidays.test.ts`.

### VAL-ORG-004: Roles
`list_roles` registered.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-ORG-005: Custom fields
`list_custom_fields`, `get_custom_field`, `list_custom_field_options`, `list_custom_field_sections` registered. Tool descriptions explain the custom_fields shape on parent resources.
**Tool:** vitest. **Evidence:** `tests/tools/custom-fields.test.ts`.

### VAL-ORG-006: Tags
`list_tags` registered as read-only. Tool description notes that tags are written via `tag_list` on parent resources.
**Tool:** vitest. **Evidence:** Same suite.

---

## VAL-RESOURCING

### VAL-RESOURCING-001: Resource requests
`list_resource_requests`, `save_resource_request`, `cancel_resource_request`, `resolve_resource_request`, `reject_resource_request` registered. Mutations gated on elicitation/dry-run.
**Tool:** vitest. **Evidence:** `tests/tools/resource-requests.test.ts`.

### VAL-RESOURCING-002: Project assignments
`list_project_assignments`, `save_project_assignment` registered.
**Tool:** vitest. **Evidence:** `tests/tools/project-assignments.test.ts`.

### VAL-RESOURCING-003: Service assignments
`list_service_assignments`, `save_service_assignment` registered.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-RESOURCING-004: Placeholders
`list_placeholders`, `save_placeholder` registered.
**Tool:** vitest. **Evidence:** `tests/tools/placeholders.test.ts`.

### VAL-RESOURCING-005: Salaries (read-only)
`list_salaries`, `get_salary` registered. Read-only by default — no save tool because of compliance sensitivity (write requires elicitation explicitly, mark feature as deferred unless rb2 wants it).
**Tool:** vitest. **Evidence:** `tests/tools/salaries.test.ts`.

### VAL-RESOURCING-006: Rate cards
`list_rate_cards` registered.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-RESOURCING-007: Deal cost rates
`list_deal_cost_rates` registered.
**Tool:** vitest. **Evidence:** Same suite.

---

## VAL-KNOWLEDGE

### VAL-KNOWLEDGE-001: Page CRUD + copy + move
`create_page`, `update_page`, `copy_page`, `move_page` registered. Mutations gated.
**Tool:** vitest. **Evidence:** `tests/tools/pages.test.ts`.

### VAL-KNOWLEDGE-002: Page publish/unpublish
`publish_page`, `unpublish_page` registered.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-KNOWLEDGE-003: Page append + replace (HTML + Markdown)
`append_page_html`, `append_page_markdown`, `replace_page_with_markdown` registered. All gated on elicitation.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-KNOWLEDGE-004: Page versions
`list_page_versions` registered as read-only.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-KNOWLEDGE-005: Sections + folders + document types
`list_sections`, `list_folders`, `save_folder`, `list_document_types` registered.
**Tool:** vitest. **Evidence:** `tests/tools/sections-folders.test.ts`.

---

## VAL-PIPELINE

### VAL-PIPELINE-001: Deal lifecycle
`close_deal`, `open_deal`, `copy_deal` registered. `close_deal` requires `lost_reason_id` argument when status implies lost; gated on elicitation.
**Tool:** vitest. **Evidence:** `tests/tools/deals-lifecycle.test.ts`.

### VAL-PIPELINE-002: Deal statuses + lost reasons
`list_deal_statuses`, `list_lost_reasons` registered as read-only.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-PIPELINE-003: Pipelines + dashboards
`list_pipelines`, `list_dashboards` registered as read-only.
**Tool:** vitest. **Evidence:** Same suite.

### VAL-PIPELINE-004: Contracts
`list_contracts`, `save_contract`, `generate_contract` registered. Generate gated on elicitation.
**Tool:** vitest. **Evidence:** `tests/tools/contracts.test.ts`.

### VAL-PIPELINE-005: Proposals
`list_proposals`, `save_proposal`, `sync_proposal` registered.
**Tool:** vitest. **Evidence:** `tests/tools/proposals.test.ts`.

---

## VAL-COMM

### VAL-COMM-001: Discussions
`list_discussions`, `save_discussion`, `resolve_discussion`, `reopen_discussion`, `subscribe_discussion`, `unsubscribe_discussion` registered.
**Tool:** vitest. **Evidence:** `tests/tools/discussions.test.ts`.

### VAL-COMM-002: Comment reactions + pin
`add_comment_reaction`, `remove_comment_reaction`, `pin_comment`, `unpin_comment` registered.
**Tool:** vitest. **Evidence:** `tests/tools/comment-reactions.test.ts`.

### VAL-COMM-003: Notifications
`list_notifications`, `mark_notification_read`, `dismiss_notification` registered.
**Tool:** vitest. **Evidence:** `tests/tools/notifications.test.ts`.

### VAL-COMM-004: Pulses + emails
`list_pulses`, `send_pulse` (gated on elicitation), `list_emails` registered.
**Tool:** vitest. **Evidence:** `tests/tools/pulses-emails.test.ts`.

---

## VAL-TRANSPORT

### VAL-TRANSPORT-001: StreamableHTTP transport works

Setting `MCP_TRANSPORT=http MCP_HTTP_PORT=8731` and starting the server lets a sample MCP client (`@modelcontextprotocol/sdk` client + StreamableHTTPClientTransport) initialize, list tools, and call a tool.

**Tool:** vitest e2e
**Evidence:** `tests/transport/http.test.ts` — spawns the server in a child process with `MCP_TRANSPORT=http`, uses the SDK client to connect, calls `whoami`, asserts it works.

### VAL-TRANSPORT-002: Bearer-token auth middleware

When `MCP_HTTP_BEARER_TOKEN=secret` is set, requests without `Authorization: Bearer secret` get `401 Unauthorized`. With the right token, requests proceed.

**Tool:** vitest
**Evidence:** Same suite — covers both unauth and authed paths.

### VAL-TRANSPORT-003: Session management

The transport supports an `mcp-session-id` header so multiple concurrent sessions don't interfere. New sessions are created on first request, reused on subsequent.

**Tool:** vitest
**Evidence:** Same suite — two sessions in parallel each see independent state.

### VAL-TRANSPORT-004: stdio still default

With no `MCP_TRANSPORT` set, the server defaults to stdio. Existing Claude Desktop configs continue to work.

**Tool:** manual run
**Evidence:** `node build/index.js` against a stdio harness still functions; documented in README.

---

## VAL-RELEASE

### VAL-RELEASE-001: Per-milestone alpha published

After each milestone (M1–M6), the npm registry has a `2.0.0-alpha.<milestone>` tag for `productive-mcp-rb2`.

**Tool:** npm view
**Evidence:** `npm view productive-mcp-rb2 versions --json` includes `2.0.0-alpha.1` … `2.0.0-alpha.6`.

### VAL-RELEASE-002: Final 2.0.0 published

After M7 sign-off, `npm view productive-mcp-rb2 version` returns `2.0.0`. The `latest` dist-tag points at `2.0.0`. The `1` dist-tag points at the last 1.x release.

**Tool:** npm view + dist-tag
**Evidence:** `npm view productive-mcp-rb2 dist-tags --json`.

### VAL-RELEASE-003: CHANGELOG present and complete

`CHANGELOG.md` at repo root documents every breaking change between 1.x and 2.0, every new tool family, and the v2 modernization features.

**Tool:** manual review
**Evidence:** Section structure: ## [2.0.0] – yyyy-mm-dd, with subsections "Breaking", "Added", "Changed", "Fixed", "Removed".

### VAL-RELEASE-004: MIGRATION.md guides 1.x → 2.x

`MIGRATION.md` walks through:
- Renamed/removed tools
- New `dry_run` arg on destructive tools
- New `structuredContent` clients can opt into
- Switching to StreamableHTTP transport

**Tool:** manual review
**Evidence:** File exists, is referenced from CHANGELOG.

### VAL-RELEASE-005: README updated

`README.md` and `README-rb2.md` reflect v2 reality. Old screenshots/examples updated.

**Tool:** manual review
**Evidence:** Files updated; tool count and feature list match v2.

---

## VAL-CROSS

### VAL-CROSS-001: No console output on stdio

When running with stdio transport, no `console.log`/`console.error` output is written. (Errors are surfaced via `McpError` over the transport.)

**Tool:** vitest e2e
**Evidence:** `tests/transport/stdio-clean.test.ts` — spawns server, captures stdout+stderr, asserts no output other than valid JSON-RPC frames during a normal session.

### VAL-CROSS-002: dotenv silences itself

When `dotenv.config()` runs in production, it does not write to stdout (already handled but verified).

**Tool:** vitest
**Evidence:** Spy on `process.stdout.write` during config import; assert no calls.

### VAL-CROSS-003: All tools have a description ≥30 chars

Every registered tool's `description` is at least 30 characters and includes the resource family + verb (e.g. "List approval policies for the configured organisation. Returns id, name, type_id, …").

**Tool:** vitest
**Evidence:** `tests/tools/descriptions.test.ts`.

### VAL-CROSS-004: All tools have a `title` annotation

Every registered tool has a human-readable `title` distinct from `name` (e.g. name=`list_companies`, title=`List companies`).

**Tool:** vitest
**Evidence:** Same suite.

### VAL-CROSS-005: All "save" tools handle both create and update

Resources where Productive uses a single endpoint that handles both (e.g. `save_resource_request`) detect whether `id` is provided and call POST or PATCH accordingly.

**Tool:** vitest
**Evidence:** `tests/tools/save-pattern.test.ts` — calling without id ↔ POST observed; calling with id ↔ PATCH observed.

### VAL-CROSS-006: TypeScript strict + zero compile errors

`npm run build` exits 0 with zero TypeScript errors under the project's `strict: true` config.

**Tool:** tsc
**Evidence:** CI step `npm run type-check` (or `npm run build`) exits 0.

### VAL-CROSS-007: ESLint passes

If we add ESLint config, `npm run lint` exits 0 with zero warnings. (Optional — only assert if we add the config.)

**Tool:** eslint
**Evidence:** CI step.

### VAL-CROSS-008: No tool fetches outside the core client

Every HTTP request goes through `src/api/core.ts`. No `fetch(` call exists in `src/tools/`.

**Tool:** ripgrep
**Evidence:** `rg "fetch\\(" src/tools/` returns 0 lines.

---

## Coverage check

- Every feature in §3 of `mission.md` has at least one assertion above
- Every assertion is fulfilled by at least one feature seeded in `bd`
- Total assertion count: 100+ (Foundation 16, MCP 10, Reports 25, Approve 7, Finance 6, Org 6, Resourcing 7, Knowledge 5, Pipeline 5, Comm 4, Transport 4, Release 5, Cross 8)

If the bd feature graph adds or removes a feature later, this contract is updated to keep parity.
