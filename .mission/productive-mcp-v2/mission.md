# Mission: Productive MCP v2

> Comprehensive overhaul of `productive-mcp-rb2`: fix bugs, restructure for scale, modernize against MCP SDK 1.27 (McpServer + structuredContent + elicitation + completions + ResourceLinks + StreamableHTTP), and expand tool coverage from ~30 to ~110 tools across the Productive.io API surface.

**Slug:** `productive-mcp-v2`
**Repo:** `/Users/ruben/Developer/productive-mcp`
**Base branch:** `main`
**Target release:** `productive-mcp-rb2@2.0.0`
**Shape date:** 2026-05-06

---

## 1. Goal

Deliver a v2 release of the Productive.io MCP server that is:

1. **Correct** — known bugs in the current code are fixed and verified
2. **Modular** — codebase respects the project's own 500-line/file and 200-line/component limits in `CLAUDE.md`
3. **Modern** — uses the high-level `McpServer` API and the latest spec features (structured tool output, elicitation, completions, ResourceLinks, optional StreamableHTTP)
4. **Comprehensive** — wraps the high-value Productive.io resource families (reports, approvals, finance, org, resourcing, knowledge, pipeline, communication) — ~110 tools total
5. **Tested** — Vitest with recorded fixtures, ≥80% line coverage, no live API calls in CI
6. **Releasable** — per-milestone `2.0.0-alpha.N` pre-releases on npm, final v2.0.0 with a CHANGELOG and migration notes

## 2. Scope

### In scope

- Refactor `src/api/client.ts` (1100+ lines) into `src/api/core.ts` + `src/api/resources/<resource>.ts` modules
- Fix all bugs identified in research (see §6 — Known Issues)
- Migrate `src/server.ts` from low-level `Server` + `CallToolRequestSchema` dispatch to the high-level `McpServer` API
- Adopt `outputSchema` + `structuredContent` on every tool (dual output: text + structured)
- Add elicitation-based confirmation + `dry_run` arg to every destructive tool
- Add completion handlers for prompts and resource templates that take IDs/names
- Return `ResourceLink` content blocks where it's natural (e.g., `create_task` returns a link to `productive://tasks/<id>` instead of/alongside text)
- Add retry-with-backoff (honor `Retry-After` on 429, exponential on 5xx) and auto-paginate-by-default in the core client
- Add a JSON:API `included` resolver so tools return resolved names instead of bare IDs
- Add Vitest unit tests with `undici` `MockAgent` for HTTP mocking + recorded fixtures
- Expand tool coverage to the families listed in §3
- Expose rb2 organisational constants as MCP resources
- Add StreamableHTTP transport (alongside stdio) for remote hosting
- Per-milestone `2.0.0-alpha.N` pre-releases, then `2.0.0` final

### Out of scope (deferred)

- OAuth / SSO auth flow — token-based only for now
- Webhooks subscriber endpoints — Productive emits webhooks; we don't need to consume them in this MCP
- `/sessions`, `/passwords`, `/invitations` — auth/admin endpoints that aren't useful from an MCP
- `/deleted_items` — soft-delete recycle bin; rarely needed
- `/webhook_logs` — debugging endpoint, not a productivity tool
- Productive UI rebrand or rename of the npm package
- Caching layer for static lookups (subsidiaries, rate cards) — discussed and rejected; live fetches are fine
- Generated client from OpenAPI — discussed and rejected; we keep hand-rolled with Zod schemas as source of truth
- Integration tests against a live Productive sandbox — not in CI; rb2 can run them manually if a sandbox org becomes available

### Deferred to a future mission (post-2.0)

- Productive Plus features (entitlements, organization_subscriptions billing UI mirrors)
- Survey response analytics tools
- Page versions diff/restore tooling

## 3. Tool inventory (target)

### Currently exposed (~30, will be refactored & modernized in M1+M2)
whoami, list_companies, list_projects, list_boards, create_board, list_task_lists, create_task_list, list_tasks, get_project_tasks, get_task, create_task, update_task_assignment, update_task_details, add_task_comment, update_task_status, list_workflow_statuses, my_tasks, list_activities, get_recent_updates, list_time_entries, create_time_entry, list_project_deals, list_deal_services, list_services, get_project_services, update_task_sprint, move_task_to_list, add_to_backlog, reposition_task, list_people, get_person, update_time_entry, delete_time_entry, list_invoices, get_invoice, list_expenses, create_expense, list_memberships, list_bookings, get_budget_burn, get_resource_plan, get_overbooked_people, get_org_overview, list_subtasks, list_todos, create_todo, update_todo, delete_todo, list_task_dependencies, add_task_dependency, remove_task_dependency, create_tasks_batch, list_pages, get_page, list_attachments

### New: Reports (M3) — 24 tools
report_bookings, report_budgets, report_companies, report_deal_funnel, report_deals, report_entitlements, report_expenses, report_financial_items, report_invoices, report_line_items, report_pages, report_payments, report_payroll_items, report_persons, report_prices, report_projects, report_proposals, report_salaries, report_services, report_surveys, report_tasks, report_time_entries, report_time, report_timesheets

### New: Approvals + write workflows (M4) — ~14 tools
list_approval_policies, get_approval_policy, create_approval_policy, archive_approval_policy, restore_approval_policy, list_approval_workflows, save_approval_workflow, list_approval_policy_assignments, save_approval_policy_assignment, approve_time_entry, bulk_approve_time_entries, reject_time_entry, unapprove_time_entry, approve_expense, bulk_approve_expenses, reject_expense, unapprove_expense

### New: Finance (M4 cont.) — ~16 tools
list_bills, get_bill, create_bill, update_bill, list_payments, get_payment, create_payment, list_purchase_orders, get_purchase_order, create_purchase_order, send_purchase_order, list_line_items, generate_line_items, finalize_invoice, send_invoice, preview_invoice, list_tax_rates, list_exchange_rates, list_invoice_templates, list_payment_reminder_sequences

### New: Org + Resourcing (M5) — ~18 tools
list_subsidiaries, list_teams, get_team, list_team_memberships, list_holidays, list_holiday_calendars, list_roles, list_custom_fields, get_custom_field, list_custom_field_options, list_custom_field_sections, list_tags, list_resource_requests, save_resource_request, list_project_assignments, save_project_assignment, list_service_assignments, list_placeholders, save_placeholder, list_rate_cards, list_deal_cost_rates, list_salaries, get_salary

### New: Knowledge + Pipeline + Comm (M6) — ~25 tools
create_page, update_page, copy_page, move_page, publish_page, unpublish_page, append_page_html, append_page_markdown, replace_page_with_markdown, list_page_versions, list_sections, list_folders, save_folder, list_document_types, list_deal_statuses, close_deal, open_deal, copy_deal, list_pipelines, list_lost_reasons, list_contracts, save_contract, list_proposals, list_dashboards, list_discussions, save_discussion, resolve_discussion, reopen_discussion, add_comment_reaction, remove_comment_reaction, pin_comment, unpin_comment, list_notifications, mark_notification_read, list_pulses

### Total at v2 GA: ~110 tools

## 4. Decisions (locked in shaping)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Coverage strategy | Full curated coverage (~110 tools) | High-value families fully wrapped; rare admin endpoints skipped |
| 2 | MCP SDK features | McpServer + structuredContent + elicitation + completion + ResourceLinks + StreamableHTTP | Adopt every relevant 1.27 feature |
| 3 | Backward compatibility | Major version (v2.0.0) clean break | Rename buggy tools, restructure outputs, document migration |
| 4 | Testing | Vitest + recorded fixtures with `undici` MockAgent | Fast, deterministic, no live API in CI |
| 5 | API client | Per-resource modules + shared `core.ts` | Files <200 LOC; one resource family per file |
| 6 | Output shape | Dual: text + `structuredContent` matching `outputSchema` | Best of both worlds for human + agent consumers |
| 7 | API quirks | Retry on 429/5xx, auto-paginate, resolve `included` (no caching) | Matches Productive's JSON:API conventions; correctness over speed |
| 8 | Write safety | Elicitation confirmation + `dry_run: true` arg | Belt-and-suspenders; works with hosts that don't support elicitation |
| 9 | Milestone sequencing | Foundation → expand | Each milestone independently shippable + scrutiny-validated |
| 10 | Type management | Hand-written Zod schemas as source of truth | Same Zod object drives `inputSchema`, `outputSchema`, runtime validation |
| 11 | rb2 constants | Keep + expose as MCP resources | Internal map preserved; agents can also discover via resources |
| 12 | Release cadence | Per-milestone alpha + final 2.0 | Dogfooding-friendly, clear migration path |

## 5. Milestones

| ID | Theme | Tools added | Validation focus |
|----|-------|------------|------------------|
| M1 | Foundation: bug fixes + client refactor + retry/paginate/include/test harness | 0 (refactor only) | All known bugs fixed; `client.ts` split; tests pass; alpha.1 |
| M2 | MCP modernization: McpServer + structuredContent + elicitation + completions + ResourceLinks | 0 (modernize only) | Every existing tool dual-outputs; elicitation works on destructive tools; completions on prompt args; alpha.2 |
| M3 | Reports family | +24 | All 24 report tools usable; ranges/grouping correct; alpha.3 |
| M4 | Approvals + Finance writes | +33 | Approval policy CRUD, time/expense approve flows with elicitation, invoice lifecycle finalize/send, bills/payments/POs CRUD; alpha.4 |
| M5 | Org + Resourcing | +18 | Subsidiaries/teams/holidays/roles/custom fields/tags + resource_requests/project_assignments/placeholders/salaries; alpha.5 |
| M6 | Knowledge + Pipeline + Comm | +25 | Pages full CRUD/copy/move/append/publish, deals lifecycle, contracts, proposals, discussions, comment reactions, notifications; alpha.6 |
| M7 | StreamableHTTP transport + Release | 0 (transport + release) | HTTP transport works with sample client; final 2.0.0 published; CHANGELOG; migration guide |

Each milestone ends with a scrutiny review (code review + automated test pass) and a user-testing validation step. These are orchestrated by `/mission-execute` and not seeded as individual `bd` features.

## 6. Known issues (to fix in M1)

Discovered during shaping (`mission.md` records the issue; `validation-contract.md` records the assertion that proves the fix):

1. `src/server.ts:18` hardcodes `version: '1.0.0'` — must come from `package.json` so the MCP `initialize` response matches what npm publishes
2. `src/tools/time-entries.ts` exports `listTimeEntresTool` (typo); imported under that name in `server.ts` — rename
3. `src/tools/tasks.ts` `getTaskTool` re-imports `getConfig()` and uses raw `fetch` instead of `ProductiveAPIClient` — bypasses error handling
4. `src/tools/tasks.ts` `listTasksTool` reads `task.attributes.status` as a number, but Productive API returns `closed` (boolean) — status display is wrong
5. `src/api/client.ts` is 1108 lines, violating the 500-line cap from `CLAUDE.md`
6. Inconsistent error handling — some tools throw `McpError`, some return `{ content: 'Error: …' }`, some throw raw `Error`
7. Pagination is inconsistent (`getAllPages` only used in 3 places; most tools one-shot)
8. No 429 / 5xx retry logic
9. JSON:API `included` is parsed inline in some tools, ignored in others — no shared resolver
10. `build/` is committed and stale relative to source
11. No tests, no CI test job
12. Tool annotations are inconsistent (some have `readOnlyHint`, most don't)
13. `client.listBookings` filter param is `started_on_after`/`started_on_before` but other endpoints use `after`/`before` — inconsistency leaks to callers
14. `dotenv` config loads at import time and pollutes test environments

## 7. Blast radius

**Files touched in M1 (refactor):**
- `src/api/client.ts` — split into `src/api/core.ts` and `src/api/resources/<resource>.ts` (one file per Productive resource family)
- `src/api/types.ts` — keep but split into `src/api/resources/<resource>/schema.ts` (Zod-first) with type inference
- `src/server.ts` — keep wiring but stop importing the old client class directly; route through new module
- All `src/tools/*.ts` — update imports to new client modules; no behaviour change in M1
- `src/config/index.ts` — guard dotenv for tests
- New: `src/api/core.ts`, `src/api/include-resolver.ts`, `src/api/retry.ts`, `src/api/paginate.ts`
- New: `tests/setup.ts`, `tests/fixtures/<resource>/*.json`, `tests/helpers/<helper>.ts`, `<file>.test.ts` co-located
- New: `vitest.config.ts`
- New: `package.json` adds `vitest`, `@vitest/coverage-v8`, `undici` (or pin), test scripts

**Files touched in M2 (modernization):**
- `src/server.ts` — full rewrite using `McpServer.registerTool/Resource/Prompt`
- All `src/tools/*.ts` — register via the new API; add `outputSchema`; emit `structuredContent`; add elicitation gate on destructive tools
- All `src/prompts/*.ts` — wrap arg schemas with `completable()` for autocomplete
- `src/resources/*.ts` — register resource templates via `ResourceTemplate`
- New: `src/elicit/confirm.ts` — shared confirmation helper that does elicitation with `dry_run` fallback

**Files touched in M3-M6 (expansion):**
- One new file per resource family added: `src/api/resources/<resource>.ts` + `src/tools/<resource>.ts` + `tests/<resource>.test.ts`
- `src/server.ts` registers each new tool

**Files touched in M7 (transport + release):**
- `src/index.ts` — gate stdio vs http via env var (e.g. `MCP_TRANSPORT=stdio|http`)
- New: `src/transport/http.ts`
- `package.json` — `bin` may need a sub-entry for `productive-mcp-rb2-http`
- `README.md`, `README-rb2.md`, new `MIGRATION.md` and `CHANGELOG.md`

**External services involved:** Productive.io REST API only.

**Database migrations:** None — this MCP holds no state.

**Rollback story:** Each alpha is a normal npm publish. To roll back, users pin to `1.x` (we keep the `1` dist-tag pointing at the last 1.x release until v2 GA). The repo keeps `main` on v2 work; if a 1.x patch is needed mid-mission, branch `1.x-maintenance` from the last 1.x tag.

## 8. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Productive API spec drift breaks recorded fixtures | Medium | Periodic re-record from a known-good org; assert response shape loosely (extra fields ignored) |
| Elicitation is unsupported by some MCP hosts (Claude Desktop today) | High | Fall back to `dry_run` + `confirm: true` arg pattern; treat elicitation as a progressive enhancement |
| StreamableHTTP transport security (auth, CORS, session fixation) | Medium | Optional transport, off by default; add bearer-token middleware; document hosting guidance |
| Refactor introduces regressions in tools that current rb2 workflows depend on | Medium | Tests in M1 cover all current tools before M2 modernization; alpha releases for dogfooding |
| Scope creep — 110 tools is a lot | Medium | Strict per-milestone boundaries; no cross-milestone dependencies allowed; if a milestone overruns, descope to a future mission |
| OpenAPI spec defects (duplicate `id` fields, typos like `annuall_cost`) | Low | Worker agents document deviations in source comments; do not blindly copy |

## 9. Open questions (to resolve before M1 starts)

None remaining — all design questions answered in shaping.

## 10. Done criteria

- [ ] All 7 milestones complete
- [ ] All VAL-* assertions in `validation-contract.md` proved by automated tests or manual evidence
- [ ] `productive-mcp-rb2@2.0.0` published to npm
- [ ] CHANGELOG and MIGRATION docs published
- [ ] At least one rb2 user (the author) has dogfooded an alpha and confirmed `whoami`, `get_budget_burn`, and `create_time_entry` still work
- [ ] No console.log/error left in production code
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm test -- --coverage` reports ≥80% lines covered
