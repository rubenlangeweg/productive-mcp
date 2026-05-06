# Features Draft — to be seeded into bd after sign-off

> Working scratch list. Seeded into `bd` in Phase 8 once the user signs off on the mission package.

Convention: each row is a single feature. `worker_type` decides routing; `fulfills` lists VAL-* assertions; `preconditions` lists feature slugs (NOT bd-ids; the orchestrator translates after seeding).

## M1 — Foundation (no new tools; refactor + bug fixes + tests)

| Slug | worker_type | preconditions | fulfills | Description |
|------|-------------|--------------|----------|-------------|
| m1-vitest-harness | core-engineer | — | VAL-FOUNDATION-010, 011, 012 | Add Vitest 1.x + `@vitest/coverage-v8` + `undici` MockAgent. Create `vitest.config.ts`, `tests/setup.ts`, `tests/helpers/withFetchMock.ts`, `tests/helpers/runTool.ts`, `tests/helpers/createTestServer.ts`. Wire `npm test`, `npm test:watch`, `npm test:coverage`, `npm run type-check`. Coverage thresholds: lines 80, branches 75. dotenv guarded for tests. |
| m1-core-client | core-engineer | m1-vitest-harness | VAL-FOUNDATION-005, 015, VAL-CROSS-008 | Create `src/api/core.ts` with `request<T>(path, opts)`, header injection, JSON:API error mapping (`mapApiError`). Replace direct `fetch` usage in tools with `core.request`. |
| m1-retry | core-engineer | m1-core-client | VAL-FOUNDATION-006, 007 | Create `src/api/retry.ts` — Retry-After honour for 429 + exponential backoff for 5xx. Wired into `core.request`. |
| m1-paginate | core-engineer | m1-core-client | VAL-FOUNDATION-008 | Create `src/api/paginate.ts` — `paginateAll(path, params, { cap })`. Replace ad-hoc `getAllPages` usage. |
| m1-include-resolver | core-engineer | m1-core-client | VAL-FOUNDATION-009 | Create `src/api/include-resolver.ts` — JSON:API `included` map + `resolve(type, id)`. |
| m1-resource-modules | core-engineer | m1-retry, m1-paginate, m1-include-resolver | VAL-FOUNDATION-005, 016 | Split `src/api/client.ts` into `src/api/resources/<resource>.ts` (one per family currently used). Each file <200 LOC. Old `client.ts` becomes a thin facade or is removed. |
| m1-fix-version | core-engineer | m1-vitest-harness | VAL-FOUNDATION-001 | Read version from `package.json` for the Server constructor. Add test. |
| m1-fix-time-entries-typo | core-engineer | m1-vitest-harness | VAL-FOUNDATION-003 | Rename `listTimeEntresTool` → `listTimeEntriesTool`. Update import in `src/server.ts`. |
| m1-fix-get-task-fetch | core-engineer | m1-core-client | VAL-FOUNDATION-002 | Refactor `getTaskTool` to use `core.request` instead of direct `fetch` + re-imported config. |
| m1-fix-task-status-display | core-engineer | m1-resource-modules | VAL-FOUNDATION-004 | Update `list_tasks` and `get_project_tasks` to read `attributes.closed: boolean`, not `attributes.status: number`. |
| m1-fix-bookings-filter | core-engineer | m1-resource-modules | VAL-FOUNDATION-014 | Unify `listBookings` filter args to `after`/`before`. |
| m1-build-policy | core-engineer | m1-vitest-harness | VAL-FOUNDATION-013 | Decide and document: keep `build/` committed with CI rebuild check, OR gitignore + rebuild on publish. Update `.gitignore` and/or `.github/workflows/npm-publish.yml` accordingly. |
| m1-existing-tool-tests | core-engineer | m1-resource-modules, m1-fix-task-status-display | VAL-FOUNDATION-010, 011 | Capture fixtures + write tests for the 30 existing tools to lock current behaviour before M2 modernization. Coverage of touched files ≥80%. |
| m1-alpha1-release | core-engineer | m1-existing-tool-tests | VAL-RELEASE-001 (partial) | Bump `package.json` to `2.0.0-alpha.1`. Update `CHANGELOG.md` skeleton. Publish to npm. |

## M2 — MCP modernization (no new tools; modernize all existing)

| Slug | worker_type | preconditions | fulfills |
|------|-------------|--------------|----------|
| m2-elicit-helper | core-engineer | M1 closed | VAL-MCP-005 — `src/elicit/confirm.ts` with capability detection, dry-run handling, fallback to `confirm: true`. |
| m2-mcpserver-bootstrap | core-engineer | m2-elicit-helper | VAL-MCP-001, 010 — Replace dispatch switch in `src/server.ts` with `McpServer.registerTool/Resource/Prompt`. Advertise capabilities. |
| m2-tool-modernize-batch1 | tool-builder | m2-mcpserver-bootstrap | VAL-MCP-002, 003, 004 (subset) — Modernize `whoami`, `list_companies`, `list_projects`, `list_boards`, `list_task_lists`, `list_tasks`, `get_project_tasks`, `get_task`, `my_tasks`, `list_people`, `get_person` (read-only). Add Zod outputSchema, structuredContent, title, annotations. |
| m2-tool-modernize-batch2 | tool-builder | m2-mcpserver-bootstrap | VAL-MCP-002, 003, 004 (subset) — Modernize `list_activities`, `get_recent_updates`, `list_time_entries`, `list_project_deals`, `list_deal_services`, `list_services`, `get_project_services`, `list_workflow_statuses`, `list_subtasks`, `list_todos`, `list_invoices`, `get_invoice`, `list_expenses`, `list_memberships`, `list_bookings`, `list_pages`, `get_page`, `list_attachments`, `list_task_dependencies`. |
| m2-tool-modernize-batch3 | write-flow-builder | m2-elicit-helper, m2-mcpserver-bootstrap | VAL-MCP-002, 003, 004, 005 (subset) — Modernize destructive tools: `create_board`, `create_task_list`, `create_task`, `update_task_assignment`, `update_task_details`, `add_task_comment`, `update_task_status`, `create_time_entry`, `update_task_sprint`, `move_task_to_list`, `add_to_backlog`, `reposition_task`, `update_time_entry`, `delete_time_entry`, `create_expense`, `create_todo`, `update_todo`, `delete_todo`, `add_task_dependency`, `remove_task_dependency`, `create_tasks_batch`. Add elicitation gate + dry_run. |
| m2-tool-modernize-rb2 | tool-builder | m2-mcpserver-bootstrap | VAL-MCP-002, 003, 004 — Modernize rb2 tools: `get_budget_burn`, `get_resource_plan`, `get_overbooked_people`, `get_org_overview`. |
| m2-resourcelinks | tool-builder | m2-tool-modernize-batch3 | VAL-MCP-007 — Add `ResourceLink` content blocks to `create_task`, `create_time_entry`, `create_board`, `create_task_list`. |
| m2-prompts-completion | tool-builder | m2-mcpserver-bootstrap | VAL-MCP-006 — Wrap project_id/person_id args on existing prompts with `completable()`. Implement completion handlers backed by `list_projects`/`list_people`. |
| m2-resource-templates | tool-builder | m2-mcpserver-bootstrap | VAL-MCP-009 — Migrate existing static resources + templates to `ResourceTemplate`. |
| m2-rb2-resources | tool-builder | m2-resource-templates | VAL-MCP-008 — Expose `productive://rb2/subsidiaries`, `…/rate-cards`, `…/service-types`, `…/teams`. |
| m2-error-mapping-audit | core-engineer | m2-tool-modernize-batch3 | VAL-FOUNDATION-015 | Audit every tool for inconsistent error handling; remove leftover `{content: 'Error: …'}` patterns. |
| m2-stdio-clean-test | core-engineer | m2-mcpserver-bootstrap | VAL-CROSS-001 | Add the stdout-purity e2e test. |
| m2-tool-titles-audit | tool-builder | m2-tool-modernize-batch3 | VAL-CROSS-003, 004 | Confirm every registered tool has `description ≥30 chars` and a distinct `title` annotation. |
| m2-alpha2-release | core-engineer | m2-tool-titles-audit, m2-rb2-resources, m2-resourcelinks, m2-prompts-completion | VAL-RELEASE-001 (partial) | Bump to 2.0.0-alpha.2. Publish. |

## M3 — Reports family (24 new tools)

One feature per report. All `worker_type: tool-builder`, all preconditioned on M2 closed.

| Slug | fulfills |
|------|----------|
| m3-report-bookings | VAL-REPORTS-01, COVERAGE |
| m3-report-budgets | VAL-REPORTS-02, COVERAGE |
| m3-report-companies | VAL-REPORTS-03, COVERAGE |
| m3-report-deal-funnel | VAL-REPORTS-04, COVERAGE |
| m3-report-deals | VAL-REPORTS-05, COVERAGE |
| m3-report-entitlements | VAL-REPORTS-06, COVERAGE |
| m3-report-expenses | VAL-REPORTS-07, COVERAGE |
| m3-report-financial-items | VAL-REPORTS-08, COVERAGE |
| m3-report-invoices | VAL-REPORTS-09, COVERAGE |
| m3-report-line-items | VAL-REPORTS-10, COVERAGE |
| m3-report-pages | VAL-REPORTS-11, COVERAGE |
| m3-report-payments | VAL-REPORTS-12, COVERAGE |
| m3-report-payroll-items | VAL-REPORTS-13, COVERAGE |
| m3-report-persons | VAL-REPORTS-14, COVERAGE |
| m3-report-prices | VAL-REPORTS-15, COVERAGE |
| m3-report-projects | VAL-REPORTS-16, COVERAGE |
| m3-report-proposals | VAL-REPORTS-17, COVERAGE |
| m3-report-salaries | VAL-REPORTS-18, COVERAGE |
| m3-report-services | VAL-REPORTS-19, COVERAGE |
| m3-report-surveys | VAL-REPORTS-20, COVERAGE |
| m3-report-tasks | VAL-REPORTS-21, COVERAGE |
| m3-report-time-entries | VAL-REPORTS-22, COVERAGE |
| m3-report-time | VAL-REPORTS-23, COVERAGE |
| m3-report-timesheets | VAL-REPORTS-24, COVERAGE |
| m3-alpha3-release | core-engineer; preconditions: all m3-report-* | VAL-RELEASE-001 (partial) — Bump 2.0.0-alpha.3. |

## M4 — Approvals + Finance writes (~33 new tools)

### Approval policies + workflows + assignments (worker: tool-builder for reads, write-flow-builder for mutations)
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m4-list-approval-policies | tool-builder | VAL-APPROVE-001 |
| m4-get-approval-policy | tool-builder | VAL-APPROVE-001 |
| m4-create-approval-policy | write-flow-builder | VAL-APPROVE-001 |
| m4-archive-approval-policy | write-flow-builder | VAL-APPROVE-001 |
| m4-restore-approval-policy | write-flow-builder | VAL-APPROVE-001 |
| m4-list-approval-workflows | tool-builder | VAL-APPROVE-002 |
| m4-save-approval-workflow | write-flow-builder | VAL-APPROVE-002 |
| m4-list-approval-assignments | tool-builder | VAL-APPROVE-003 |
| m4-save-approval-assignment | write-flow-builder | VAL-APPROVE-003 |

### Time entry approval flows (all write-flow-builder)
| Slug | fulfills |
|------|----------|
| m4-approve-time-entry | VAL-APPROVE-004 |
| m4-bulk-approve-time-entries | VAL-APPROVE-005 |
| m4-reject-time-entry | VAL-APPROVE-006 |
| m4-unapprove-time-entry | VAL-APPROVE-006 |
| m4-unreject-time-entry | VAL-APPROVE-006 |

### Expense approval flows (all write-flow-builder)
| Slug | fulfills |
|------|----------|
| m4-approve-expense | VAL-APPROVE-007 |
| m4-bulk-approve-expenses | VAL-APPROVE-007 |
| m4-reject-expense | VAL-APPROVE-007 |
| m4-unapprove-expense | VAL-APPROVE-007 |
| m4-unreject-expense | VAL-APPROVE-007 |

### Finance: bills + payments + purchase orders + line items + invoice lifecycle
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m4-list-bills | tool-builder | VAL-FINANCE-001 |
| m4-get-bill | tool-builder | VAL-FINANCE-001 |
| m4-create-bill | write-flow-builder | VAL-FINANCE-001 |
| m4-update-bill | write-flow-builder | VAL-FINANCE-001 |
| m4-list-payments | tool-builder | VAL-FINANCE-002 |
| m4-get-payment | tool-builder | VAL-FINANCE-002 |
| m4-create-payment | write-flow-builder | VAL-FINANCE-002 |
| m4-list-purchase-orders | tool-builder | VAL-FINANCE-003 |
| m4-get-purchase-order | tool-builder | VAL-FINANCE-003 |
| m4-create-purchase-order | write-flow-builder | VAL-FINANCE-003 |
| m4-send-purchase-order | write-flow-builder | VAL-FINANCE-003 |
| m4-list-line-items | tool-builder | VAL-FINANCE-004 |
| m4-generate-line-items | write-flow-builder | VAL-FINANCE-004 |
| m4-finalize-invoice | write-flow-builder | VAL-FINANCE-005 |
| m4-send-invoice | write-flow-builder | VAL-FINANCE-005 |
| m4-preview-invoice | tool-builder | VAL-FINANCE-005 |
| m4-list-tax-rates | tool-builder | VAL-FINANCE-006 |
| m4-list-exchange-rates | tool-builder | VAL-FINANCE-006 |
| m4-list-invoice-templates | tool-builder | VAL-FINANCE-006 |
| m4-list-payment-reminder-sequences | tool-builder | VAL-FINANCE-006 |
| m4-alpha4-release | core-engineer; preconditions: all M4 | VAL-RELEASE-001 (partial) |

## M5 — Org + Resourcing (~25 new tools)

### Org (mostly read-only, tool-builder)
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m5-list-subsidiaries | tool-builder | VAL-ORG-001 |
| m5-list-teams | tool-builder | VAL-ORG-002 |
| m5-get-team | tool-builder | VAL-ORG-002 |
| m5-list-team-memberships | tool-builder | VAL-ORG-002 |
| m5-list-holidays | tool-builder | VAL-ORG-003 |
| m5-list-holiday-calendars | tool-builder | VAL-ORG-003 |
| m5-list-roles | tool-builder | VAL-ORG-004 |
| m5-list-custom-fields | tool-builder | VAL-ORG-005 |
| m5-get-custom-field | tool-builder | VAL-ORG-005 |
| m5-list-custom-field-options | tool-builder | VAL-ORG-005 |
| m5-list-custom-field-sections | tool-builder | VAL-ORG-005 |
| m5-list-tags | tool-builder | VAL-ORG-006 |

### Resourcing
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m5-list-resource-requests | tool-builder | VAL-RESOURCING-001 |
| m5-save-resource-request | write-flow-builder | VAL-RESOURCING-001 |
| m5-cancel-resource-request | write-flow-builder | VAL-RESOURCING-001 |
| m5-resolve-resource-request | write-flow-builder | VAL-RESOURCING-001 |
| m5-reject-resource-request | write-flow-builder | VAL-RESOURCING-001 |
| m5-list-project-assignments | tool-builder | VAL-RESOURCING-002 |
| m5-save-project-assignment | write-flow-builder | VAL-RESOURCING-002 |
| m5-list-service-assignments | tool-builder | VAL-RESOURCING-003 |
| m5-save-service-assignment | write-flow-builder | VAL-RESOURCING-003 |
| m5-list-placeholders | tool-builder | VAL-RESOURCING-004 |
| m5-save-placeholder | write-flow-builder | VAL-RESOURCING-004 |
| m5-list-salaries | tool-builder | VAL-RESOURCING-005 |
| m5-get-salary | tool-builder | VAL-RESOURCING-005 |
| m5-list-rate-cards | tool-builder | VAL-RESOURCING-006 |
| m5-list-deal-cost-rates | tool-builder | VAL-RESOURCING-007 |
| m5-alpha5-release | core-engineer; preconditions: all M5 | VAL-RELEASE-001 (partial) |

## M6 — Knowledge + Pipeline + Comm (~32 new tools)

### Knowledge
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m6-create-page | write-flow-builder | VAL-KNOWLEDGE-001 |
| m6-update-page | write-flow-builder | VAL-KNOWLEDGE-001 |
| m6-copy-page | write-flow-builder | VAL-KNOWLEDGE-001 |
| m6-move-page | write-flow-builder | VAL-KNOWLEDGE-001 |
| m6-publish-page | write-flow-builder | VAL-KNOWLEDGE-002 |
| m6-unpublish-page | write-flow-builder | VAL-KNOWLEDGE-002 |
| m6-append-page-html | write-flow-builder | VAL-KNOWLEDGE-003 |
| m6-append-page-markdown | write-flow-builder | VAL-KNOWLEDGE-003 |
| m6-replace-page-with-markdown | write-flow-builder | VAL-KNOWLEDGE-003 |
| m6-list-page-versions | tool-builder | VAL-KNOWLEDGE-004 |
| m6-list-sections | tool-builder | VAL-KNOWLEDGE-005 |
| m6-list-folders | tool-builder | VAL-KNOWLEDGE-005 |
| m6-save-folder | write-flow-builder | VAL-KNOWLEDGE-005 |
| m6-list-document-types | tool-builder | VAL-KNOWLEDGE-005 |

### Pipeline
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m6-close-deal | write-flow-builder | VAL-PIPELINE-001 |
| m6-open-deal | write-flow-builder | VAL-PIPELINE-001 |
| m6-copy-deal | write-flow-builder | VAL-PIPELINE-001 |
| m6-list-deal-statuses | tool-builder | VAL-PIPELINE-002 |
| m6-list-lost-reasons | tool-builder | VAL-PIPELINE-002 |
| m6-list-pipelines | tool-builder | VAL-PIPELINE-003 |
| m6-list-dashboards | tool-builder | VAL-PIPELINE-003 |
| m6-list-contracts | tool-builder | VAL-PIPELINE-004 |
| m6-save-contract | write-flow-builder | VAL-PIPELINE-004 |
| m6-generate-contract | write-flow-builder | VAL-PIPELINE-004 |
| m6-list-proposals | tool-builder | VAL-PIPELINE-005 |
| m6-save-proposal | write-flow-builder | VAL-PIPELINE-005 |
| m6-sync-proposal | write-flow-builder | VAL-PIPELINE-005 |

### Comm
| Slug | worker_type | fulfills |
|------|-------------|----------|
| m6-list-discussions | tool-builder | VAL-COMM-001 |
| m6-save-discussion | write-flow-builder | VAL-COMM-001 |
| m6-resolve-discussion | write-flow-builder | VAL-COMM-001 |
| m6-reopen-discussion | write-flow-builder | VAL-COMM-001 |
| m6-subscribe-discussion | write-flow-builder | VAL-COMM-001 |
| m6-unsubscribe-discussion | write-flow-builder | VAL-COMM-001 |
| m6-add-comment-reaction | write-flow-builder | VAL-COMM-002 |
| m6-remove-comment-reaction | write-flow-builder | VAL-COMM-002 |
| m6-pin-comment | write-flow-builder | VAL-COMM-002 |
| m6-unpin-comment | write-flow-builder | VAL-COMM-002 |
| m6-list-notifications | tool-builder | VAL-COMM-003 |
| m6-mark-notification-read | write-flow-builder | VAL-COMM-003 |
| m6-dismiss-notification | write-flow-builder | VAL-COMM-003 |
| m6-list-pulses | tool-builder | VAL-COMM-004 |
| m6-send-pulse | write-flow-builder | VAL-COMM-004 |
| m6-list-emails | tool-builder | VAL-COMM-004 |
| m6-alpha6-release | core-engineer; preconditions: all M6 | VAL-RELEASE-001 (partial) |

## M7 — StreamableHTTP + Release

| Slug | worker_type | preconditions | fulfills |
|------|-------------|--------------|----------|
| m7-http-transport | core-engineer | M6 closed | VAL-TRANSPORT-001, 003, 004 |
| m7-http-bearer-auth | core-engineer | m7-http-transport | VAL-TRANSPORT-002 |
| m7-http-tests | core-engineer | m7-http-bearer-auth | VAL-TRANSPORT-001..004 |
| m7-changelog | core-engineer | m7-http-tests | VAL-RELEASE-003 |
| m7-migration-guide | core-engineer | m7-http-tests | VAL-RELEASE-004 |
| m7-readme-update | core-engineer | m7-changelog | VAL-RELEASE-005 |
| m7-final-2.0-release | core-engineer | m7-readme-update, m7-migration-guide | VAL-RELEASE-002 |

## Summary

- 7 milestones
- 7 epic issues
- ~120 feature issues
- ~110 VAL-* assertion issues
- 4 worker types: core-engineer (opus), tool-builder (sonnet), write-flow-builder (opus), scrutiny-reviewer (opus)
- All assertions in `validation-contract.md` map to at least one feature above
- All features map to at least one assertion
