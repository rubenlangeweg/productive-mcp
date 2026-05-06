# Productive API: Approvals, Finance, and Org Structure

Research document for MCP tool implementation. Source: `api-master.yaml` (121 189 lines).

---

## 1. Summary

The Productive API uses JSON:API (media type `application/vnd.api+json`). Every request carries an `X-Organization-Id` header. All list endpoints accept `filter[*]` query-string parameters and a `sort` parameter. Filter operators are `eq`, `not_eq`, `contains`, `not_contain`, `gt`, `lt`. Pagination uses `page[number]` / `page[size]`.

**Three broad families are covered here:**

| Family | Resources |
|--------|-----------|
| Approval | approval_policies, approval_policy_assignments, approval_workflows, time-entry state transitions, expense state transitions, booking unapprove |
| Finance | bills, payments, purchase_orders, line_items, invoices (lifecycle), invoice_attributions, invoice_templates, tax_rates, exchange_rates, payment_reminder_sequences, einvoice_identities, bank_accounts, revenue_distributions, automatic_invoicing_rules |
| Org | subsidiaries, teams, team_memberships, holidays, holiday_calendars, roles, custom_fields, custom_field_options, custom_field_sections, tags |

**Key design patterns:**
- Archive/restore via `PATCH /{id}/archive` and `PATCH /{id}/restore` — returns 200 or 409 Conflict if a dependency blocks the operation.
- Approve/reject/unapprove/unreject are all `PATCH` actions.
- Bulk approval endpoints accept an `ids` array in the request body.
- Elicitation is warranted for all state-transition tools (approve, reject, unapprove, unreject, finalize, send) and all destructive operations (delete, bulk-delete, archive).

---

## 2. Approval Policies, Workflows, and Assignments

### 2.1 ApprovalPolicy

**Resource type:** `approval_policies`

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Display name |
| `type_id` | integer (enum) | 1 = absence, 2 = budget, 3 = deal; **required on create** |
| `custom` | boolean | True if created for a specific assignment |
| `default` | boolean | Whether this is the default for its type |
| `status` | integer (enum) | 1 = active, 2 = archived |
| `archived_at` | datetime | Null when active |

**Relationships:** `organization`

**List filters:** `type_id`, `status`, `archived_at`, `name`, `default`, `custom`

**Archive/Restore behaviour:** `PATCH /api/v2/approval_policies/{id}/archive` — marks `archived_at`, returns 409 if workflows are still active. `PATCH /api/v2/approval_policies/{id}/restore` unsets `archived_at`.

**Create/Update body (required: `type_id`):**
```json
{ "data": { "attributes": { "type_id": 1, "name": "Team Lead Approval", "default": false } } }
```

**API lines:** 1465–1596

---

### 2.2 ApprovalPolicyAssignment

**Resource type:** `approval_policy_assignments`

Links an approval policy to a specific target (a person for absence approvals, or a budget/deal for budget approvals).

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `target_id` | integer | Person ID or budget/deal ID |
| `target_type` | string | `"Person"` or `"Quote"` |

**Relationships:** `approval_policy`, `organization`, `deal` (if budget target), `person` (if person target)

**List filters:** `target_id`, `target_type`, `approval_policy_id`

**No archive/restore** — only DELETE (204 No Content).

**Create/Update body:**
```json
{ "data": { "attributes": { "target_type": "Person" }, "relationships": { "approval_policy": { "data": { "type": "approval_policies", "id": "11" } }, "assignee": { "data": { "type": "people", "id": "12" } } } } }
```

**API lines:** 1597–1693

---

### 2.3 ApprovalWorkflow

**Resource type:** `approval_workflows`

Child of an `approval_policy`. Each policy can have multiple workflows, one per target type (time entries, absences, expenses). Defines who approves, who is notified, and whether unanimous or any-one approval is required.

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `approval_policy_id` | integer | Parent policy |
| `target_type_id` | integer (enum) | 1 = time entries, 2 = expenses, 3 = absences |
| `event_id` | integer | Absence category, relevant for type 3 |
| `approval_requirement_id` | integer (enum) | Unanimous vs. any-one vs. sequential |
| `approver_ids` | array[integer] | Explicit approver person IDs |
| `dynamic_approver_ids` | string | Rule-based / role-based approver IDs |
| `subscriber_ids` | array[integer] | Notification-only persons |
| `dynamic_subscriber_ids` | string | Rule-based subscribers |

**Relationships:** `organization`, `approval_policy`, `approvers`, `subscribers`, `event`

**No list endpoint** (`/api/v2/approval_workflows` is POST-only). Individual GET/PATCH/DELETE at `/{id}`.

**Create/Update body:**
```json
{ "data": { "attributes": { "approval_policy_id": 7, "target_type_id": 1, "approver_ids": [42, 43], "approval_requirement_id": 1 } } }
```

**API lines:** 1694–1769

---

### MCP Tool List — Approvals Admin

| Tool | Operation | Notes |
|------|-----------|-------|
| `list_approval_policies` | GET /approval_policies | filters: type_id, status |
| `get_approval_policy` | GET /approval_policies/{id} | |
| `create_approval_policy` | POST /approval_policies | required: type_id |
| `update_approval_policy` | PATCH /approval_policies/{id} | |
| `archive_approval_policy` | PATCH /approval_policies/{id}/archive | elicitation |
| `restore_approval_policy` | PATCH /approval_policies/{id}/restore | |
| `list_approval_policy_assignments` | GET /approval_policy_assignments | |
| `get_approval_policy_assignment` | GET /approval_policy_assignments/{id} | |
| `create_approval_policy_assignment` | POST /approval_policy_assignments | |
| `update_approval_policy_assignment` | PATCH /approval_policy_assignments/{id} | |
| `delete_approval_policy_assignment` | DELETE /approval_policy_assignments/{id} | elicitation |
| `get_approval_workflow` | GET /approval_workflows/{id} | |
| `create_approval_workflow` | POST /approval_workflows | |
| `update_approval_workflow` | PATCH /approval_workflows/{id} | |
| `delete_approval_workflow` | DELETE /approval_workflows/{id} | elicitation |

---

## 3. Time Entry Approval Flow

### 3.1 TimeEntry data model (approval-relevant fields)

**Resource type:** `time_entries`

| Field | Type | Notes |
|-------|------|-------|
| `service_id` | integer | **required** |
| `person_id` | integer | **required** |
| `date` | date | **required** |
| `time` | integer | Minutes tracked; **required** |
| `note` | string | Free-text note |
| `approved` | boolean | Read-only; set via approve action |
| `rejected` | boolean | Read-only |
| `rejected_reason` | string | Populated on rejection |
| `submitted` | boolean | Whether submitted via timesheet |
| `approver_id` | integer | Who approved this entry |
| `assigned_approver_id` | integer | Who is in the approval queue |
| `approval_policy_id` | integer | Linked policy |
| `invoicing_status` | integer (enum) | 1/2/3 |
| `billable_time` | integer | Minutes billable to client |

**Relationships:** `timesheet`, `service`, `task`, `approver`, `person`, `organization`

**Key list filters for approval workflows:** `person_id`, `service_id`, `deal_id`, `project_id`, `date`, `approved`, `rejected`, `submitted`, `approver_id`, `assigned_approver_id`, `approval_policy_id`, `billable_time`, `created_at`, `updated_at`

### 3.2 State transitions

All transitions are `PATCH` with no required request body unless noted.

| Endpoint | operationId | Effect |
|----------|-------------|--------|
| `PATCH /api/v2/time_entries/{id}/approve` | `time_entries-approve-approve` | Approve single entry — sets `approved: true` |
| `PATCH /api/v2/time_entries/approve` | `time_entries-approve-update-bulk` | Bulk approve — body contains time_entry filter/ids |
| `PATCH /api/v2/time_entries/{id}/unapprove` | `time_entries-unapprove-unapprove` | Revoke approval |
| `PATCH /api/v2/time_entries/unapprove` | `time_entries-unapprove-update-bulk` | Bulk unapprove |
| `PATCH /api/v2/time_entries/{id}/reject` | `time_entries-reject-reject` | Reject — returns 409 on conflict |
| `PATCH /api/v2/time_entries/{id}/unreject` | `time_entries-unreject-unreject` | Revoke rejection — returns 409 on conflict |

**Daily rb2 use case:** Approving a full week of entries for a person. Recommended flow:
1. `list_time_entries` filtered by `person_id` + `date` range + `approved: false` + `submitted: true`
2. Present summary (entry count, total time, projects)
3. Elicit confirmation
4. `bulk_approve_time_entries` with the filter / ids payload

**API lines:** 12402–12646

### 3.3 MCP Tool List — Time Entry Approvals

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_time_entries` | GET /time_entries | — |
| `get_time_entry` | GET /time_entries/{id} | — |
| `approve_time_entry` | PATCH /time_entries/{id}/approve | yes |
| `bulk_approve_time_entries` | PATCH /time_entries/approve | yes — show count before confirming |
| `unapprove_time_entry` | PATCH /time_entries/{id}/unapprove | yes |
| `bulk_unapprove_time_entries` | PATCH /time_entries/unapprove | yes |
| `reject_time_entry` | PATCH /time_entries/{id}/reject | yes |
| `unreject_time_entry` | PATCH /time_entries/{id}/unreject | yes |

---

## 4. Expense Approval Flow

### 4.1 Expense data model (approval-relevant)

**Resource type:** `expenses`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | **required** |
| `currency` | string | **required** (ISO code) |
| `date` | date | **required** |
| `amount` | integer | Unit cost in expense currency |
| `quantity` | integer | Number of units |
| `billable_amount` | integer | Amount billable to client |
| `reimbursable` | boolean | Whether expense is reimbursable |
| `reimbursed_on` | date | When reimbursed |
| `tax_rate_id` | integer | Linked tax rate |
| `tax_inclusion` | boolean | Whether amount is tax-inclusive |
| `service_id` | integer | Budget service |
| `person_id` | integer | Who incurred expense |
| `vendor_id` | integer | Vendor company |
| `purchase_order_id` | integer | Related PO |
| `rejected_reason` | string | |
| `approved` | boolean | read-only |
| `rejected` | boolean | read-only |
| `assigned_approver_id` | integer | |
| `awaiting_approval_from_approver_id` | integer | current pending approver |
| `approver_id` | integer | who approved |
| `custom_fields` | hash | custom field values |

**List filters:** `status`, `person_id`, `service_id`, `deal_id`, `project_id`, `date`, `approved`, `rejected`, `draft`, `awaiting_approval_from_approver_id`, `purchase_order_id`, `invoice_id`, `reimbursable`, `query`

### 4.2 State transitions

| Endpoint | Body | Effect |
|----------|------|--------|
| `PATCH /api/v2/expenses/{id}/approve` | `expense_approve` body (optional `approver_id`, `note`) | Approve |
| `PATCH /api/v2/expenses/bulk_approve` | `{ "data": { "attributes": { "ids": [1,2,3] } } }` | Bulk approve by ID array |
| `PATCH /api/v2/expenses/{id}/reject` | — | Reject |
| `PATCH /api/v2/expenses/{id}/unapprove` | — | Revoke approval |
| `PATCH /api/v2/expenses/{id}/unreject` | `expense_unreject` body (`note`, `approver_id`) | Revoke rejection |

**API lines:** 4889–5149

### 4.3 MCP Tool List — Expense Approvals

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_expenses` | GET /expenses | — |
| `get_expense` | GET /expenses/{id} | — |
| `create_expense` | POST /expenses | — |
| `update_expense` | PATCH /expenses/{id} | — |
| `delete_expense` | DELETE /expenses/{id} | yes |
| `approve_expense` | PATCH /expenses/{id}/approve | yes |
| `bulk_approve_expenses` | PATCH /expenses/bulk_approve | yes — show count |
| `reject_expense` | PATCH /expenses/{id}/reject | yes |
| `unapprove_expense` | PATCH /expenses/{id}/unapprove | yes |
| `unreject_expense` | PATCH /expenses/{id}/unreject | yes |

**Booking unapprove** (standalone): `PATCH /api/v2/bookings/{id}/unapprove` (line 2505) — revokes an approved booking; warrants elicitation.

---

## 5. Bills, Payments, and Purchase Orders

### 5.1 Bill

**Resource type:** `bills`

Bills are vendor receipts/invoices received against a purchase order.

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `purchase_order_id` | integer | **required** |
| `date` | date | Issue date |
| `due_date` | date | Payment due date |
| `invoice_number` | string | Vendor invoice number |
| `attachment_id` | integer | Receipt document |
| `total_cost` | computed | In bill currency |
| `total_cost_default` | computed | In org default currency |
| `total_received` | computed | Amount received |
| `currency_default` / `currency_normalized` | computed | |

**Relationships:** `purchase_order`, `attachment`, `creator`, `organization`

**Endpoints:** POST `/bills`, GET/PATCH/DELETE `/bills/{id}` — no list endpoint (filtered via purchase_order_id on bills sub-resources or via GET /bills if a filter param exists).

**API lines:** 2128–2211

---

### 5.2 Payment

**Resource type:** `payments`

Payments against finalized invoices.

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `invoice_id` | integer | **required** |
| `amount` | integer | **required** (in invoice currency, minor units) |
| `paid_on` | date | Payment date |
| `written_off_on` | date | Write-off date if uncollectable |
| `note` | string | Memo |
| `number` | string | Auto-generated (e.g. PAY-2026-015) |
| `external_id` | string | Xero sync reference |

**Relationships:** `invoice`, `organization`

**List filters:** `invoice_id`, `company_id`, `budget_id`, `project_id`, `paid_on`, `paid_before`, `paid_after`, `query`, `written_off_on`

**API lines:** 7893–7927

---

### 5.3 PurchaseOrder

**Resource type:** `purchase_orders`

**Attributes (create/update):**

| Field | Type | Notes |
|-------|------|-------|
| `subject` | string | Subject line |
| `currency` | string | ISO currency |
| `issued_on` | date | |
| `delivery_on` | date | |
| `sent_on` | date | When sent |
| `status_id` | integer (enum) | 1 = draft, 2 = finalized |
| `vendor_id` | integer | Vendor company |
| `deal_id` | integer | Associated budget |
| `note` | text | Body |
| `attachment_id` | integer | |
| `subscriber_ids` | array | |
| `document_type_id` | integer | |

**Computed:** `total_cost`, `total_cost_default`, `total_cost_normalized`, `total_cost_with_tax_*`, `total_received`, `exchange_rate`, `export_url`

**Extra actions:**
- `POST /purchase_orders/copy` — copy a PO
- `GET /purchase_orders/{id}/export` — export to Xero
- `PATCH /purchase_orders/{id}/send` — email PO to vendor; body: `{ to: [...], subject: "...", body: "..." }`; marks `sent_on` today

**List filters:** `status_id`, `vendor_id`, `deal_id`, `project_id`, `currency`, `issued_on`, `sent_status`, `query`

**API lines:** 9249–9437

---

### MCP Tool List — Bills / Payments / POs

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_bills` | GET /bills | — |
| `get_bill` | GET /bills/{id} | — |
| `create_bill` | POST /bills | — |
| `update_bill` | PATCH /bills/{id} | — |
| `delete_bill` | DELETE /bills/{id} | yes |
| `list_payments` | GET /payments | — |
| `get_payment` | GET /payments/{id} | — |
| `create_payment` | POST /payments | — |
| `update_payment` | PATCH /payments/{id} | — |
| `delete_payment` | DELETE /payments/{id} | yes |
| `list_purchase_orders` | GET /purchase_orders | — |
| `get_purchase_order` | GET /purchase_orders/{id} | — |
| `create_purchase_order` | POST /purchase_orders | — |
| `update_purchase_order` | PATCH /purchase_orders/{id} | — |
| `delete_purchase_order` | DELETE /purchase_orders/{id} | yes |
| `copy_purchase_order` | POST /purchase_orders/copy | — |
| `send_purchase_order` | PATCH /purchase_orders/{id}/send | yes — sends email |
| `export_purchase_order` | GET /purchase_orders/{id}/export | — |

---

## 6. Line Items, Invoice Lifecycle, and Invoice Attributions

### 6.1 LineItem

**Resource type:** `line_items`

Manual or auto-generated line items on invoices.

**Attributes (create required: `invoice_id`, `unit_price`, `quantity`, `tax_rate_id`):**

| Field | Type | Notes |
|-------|------|-------|
| `invoice_id` | integer | Parent invoice |
| `unit_price` | integer | Minor units |
| `quantity` | number | |
| `discount` | number | Percentage discount |
| `tax_rate_id` | integer | |
| `tax_name` | string | Snapshot of tax name |
| `tax_value` | number | Snapshot of tax value |
| `unit_id` | integer | Unit of measure |
| `position` | integer | Sort order |
| `service_id` | integer | Source service |
| `expense_id` | integer | Source expense |
| `service_type_id` | integer | |
| `kpd_code_id` | integer | KPD code (Slovak e-invoice) |

**`POST /line_items/generate`** — automatically generates line items for an invoice from the budget/service's tracked time/expenses using the invoice's configured invoicing method (see Productive help article).

**API lines:** 6397–6535

---

### 6.2 Invoice Lifecycle Actions

| Endpoint | HTTP | Effect | Body |
|----------|------|--------|------|
| `GET /invoices/{id}/preview` | GET | Simulate line item generation, no write | none |
| `PATCH /invoices/{id}/finalize` | PATCH | Locks invoice (draft → finalized) | none |
| `PATCH /invoices/{id}/send` | PATCH | Emails invoice to client; marks `sent_on` | `send_invoice` body (to, cc, bcc, subject, body) |
| `PATCH /invoices/{id}/send_einvoice` | PATCH | Transmits PEPPOL/DIR3 e-invoice | `send_einvoice` body |

**Invoice create/update attributes:**

| Required | Optional |
|----------|----------|
| `company_id`, `currency`, `invoiced_on` | `number`, `note`, `subject`, `pay_on`, `delivery_on`, `discount`, `tag_list`, `subsidiary_id`, `bank_account_id`, `invoice_type_id` (1=invoice, 2=credit note), `document_type_id`, `parent_invoice_id`, `custom_fields`, `subscriber_ids` |

**Invoice status fields:** `payment_status` (1/2/3), `sent_status` (1/2), `invoice_aging` (0–4), `credited` (boolean)

**API lines:** 6035–6299

---

### 6.3 InvoiceAttribution

Links an invoice to one or more budget deals, recording how much of the invoice applies to each deal.

**Attributes (create required: `invoice_id`, `budget_id`, `amount`):**
`date_from`, `date_to`, `amount`

**API lines:** 5938–6034

---

### 6.4 InvoiceTemplate

Auto-invoicing configuration tied to a budget — defines which line items and what schedule to use for automatic invoice generation.

**Endpoints:** GET/POST `/invoice_templates`, GET/PATCH/DELETE `/invoice_templates/{id}`

**API lines:** 6300–6395

---

### MCP Tool List — Line Items + Invoice Actions

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_line_items` | GET /line_items | — |
| `get_line_item` | GET /line_items/{id} | — |
| `create_line_item` | POST /line_items | — |
| `update_line_item` | PATCH /line_items/{id} | — |
| `delete_line_item` | DELETE /line_items/{id} | yes |
| `generate_line_items` | POST /line_items/generate | — |
| `list_invoices` | GET /invoices | — |
| `get_invoice` | GET /invoices/{id} | — |
| `create_invoice` | POST /invoices | — |
| `update_invoice` | PATCH /invoices/{id} | — |
| `delete_invoice` | DELETE /invoices/{id} | yes |
| `preview_invoice` | GET /invoices/{id}/preview | — |
| `finalize_invoice` | PATCH /invoices/{id}/finalize | yes — irreversible |
| `send_invoice` | PATCH /invoices/{id}/send | yes — sends email |
| `send_einvoice` | PATCH /invoices/{id}/send_einvoice | yes — transmits to network |
| `list_invoice_attributions` | GET /invoice_attributions | — |
| `create_invoice_attribution` | POST /invoice_attributions | — |
| `update_invoice_attribution` | PATCH /invoice_attributions/{id} | — |
| `delete_invoice_attribution` | DELETE /invoice_attributions/{id} | yes |
| `list_invoice_templates` | GET /invoice_templates | — |
| `get_invoice_template` | GET /invoice_templates/{id} | — |
| `create_invoice_template` | POST /invoice_templates | — |
| `update_invoice_template` | PATCH /invoice_templates/{id} | — |
| `delete_invoice_template` | DELETE /invoice_templates/{id} | yes |

---

## 7. Tax Rates and Currency (tax_rates, exchange_rates)

### 7.1 TaxRate

**Resource type:** `tax_rates`

**Attributes (create required: `name`, `subsidiary_id`):**

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Display name (e.g. "VAT 21%") |
| `subsidiary_id` | integer | Scoped to subsidiary |
| `primary_component_name` | string | e.g. "VAT" |
| `primary_component_value` | number | Percentage e.g. 21.0 |
| `secondary_component_name` | string | For compound taxes |
| `secondary_component_value` | number | |
| `archived_at` | datetime | |

**Archive/Restore:** `PATCH /tax_rates/{id}/archive` (403 if used), `PATCH /tax_rates/{id}/restore`
**Note:** Archive/create/update all return 403 Forbidden if caller lacks finance admin permissions.

**List filters:** `name`, `subsidiary_id`, `archived_at`, `status`

**API lines:** 12071–12234

---

### 7.2 ExchangeRate

**Resource type:** `exchange_rates`

Read-only. Returns a set of daily exchange rates used for multi-currency reporting.

**Attributes:** `date`, `rates` (array of `{from_currency, to_currency, rate}`), `out_of_date`

**Endpoint:** GET-only `/exchange_rates`

**Filters:** `date` (range operators supported: `gt`, `lt`, `eq`)

**API lines:** 4875–4888

---

### MCP Tool List — Tax + Currency

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_tax_rates` | GET /tax_rates | — |
| `get_tax_rate` | GET /tax_rates/{id} | — |
| `create_tax_rate` | POST /tax_rates | — |
| `update_tax_rate` | PATCH /tax_rates/{id} | — |
| `archive_tax_rate` | PATCH /tax_rates/{id}/archive | yes |
| `restore_tax_rate` | PATCH /tax_rates/{id}/restore | — |
| `list_exchange_rates` | GET /exchange_rates | — |

---

## 8. Org Structure (subsidiaries, teams, holidays, roles)

### 8.1 Subsidiary

**Resource type:** `subsidiaries`

Legal billing entity within the organization. Invoices are always issued by a subsidiary.

**Attributes (create required: `name`):**

| Field | Notes |
|-------|-------|
| `name` | Legal entity name |
| `invoice_number_format` | Template string |
| `invoice_number_scope` | Scope for numbering |
| `default_tax_rate_id` | Default applied to invoice lines |
| `default_bank_account_id` | |
| `default_document_type_id` | PDF template |
| `invoice_logo_url` | |
| `show_delivery_date` | Boolean |
| `facility_costs` | Monthly overhead |
| `facility_costs_breakdown` | Per-category breakdown |
| `custom_domain_id` | For outgoing email |

**Relationships:** `default_tax_rate`, `default_bank_account`, `default_document_type`, `einvoice_identity`, `einvoice_configuration`, `integration`, `organization`

**Archive:** `PATCH /subsidiaries/{id}/archive` (409 if invoices exist)
**No restore endpoint** in the spec — archive is one-way.

**API lines:** 11153–11258

---

### 8.2 Teams and TeamMemberships

**Team (`teams`):** Named group, used for access control and reporting.

| Field | Notes |
|-------|-------|
| `name` | **required** |
| `color_id` | Integer |
| `icon_id` | String |
| `members` | Relationship (people) |

**TeamMembership (`team_memberships`):** Join record `team ↔ person`. No attributes beyond the relationship keys.

**Endpoints:** POST/GET `/teams`, GET/PATCH/DELETE `/teams/{id}`. POST/GET `/team_memberships`, GET/DELETE `/team_memberships/{id}`.

**API lines:** 12305–12401

---

### 8.3 Holidays and Holiday Calendars

**HolidayCalendar (`holiday_calendars`):** Named calendar grouping holidays for a region/country. Filter: `name`, `organization_id`.

**Holiday (`holidays`):** Individual date entry within a calendar.

| Field | Notes |
|-------|-------|
| `name` | **required** |
| `date` | **required** |
| `holiday_calendar_id` | **required** |

**Endpoints:** POST/GET `/holidays`, GET/PATCH/DELETE `/holidays/{id}`. POST/GET `/holiday_calendars`, GET/PATCH/DELETE `/holiday_calendars/{id}`.

**API lines:** 5445–5619

---

### 8.4 Roles (Permission Sets)

**Resource type:** `roles`

**Attributes (create required: `name`, `user_type_id`):**

| Field | Notes |
|-------|-------|
| `name` | Permission set name |
| `user_type_id` | Type of user (admin, member, …) |
| `base_role_id` | Role to inherit from |
| `description` | |
| `permissions` | Object/hash of permission flags |

**Endpoints:** POST/GET `/roles`, GET/PATCH/DELETE `/roles/{id}`

**API lines:** 10363–10440

---

### 8.5 Other Org Resources

**BankAccount (`bank_accounts`):** Subsidiary-scoped. Fields: `name`, `number`, `currency`, `bank_name`, `swift_code`, `bank_address`, `subsidiary_id`. Archive/restore available.
**API lines:** 1964–2127

**RevenueDistribution (`revenue_distributions`):** CRUD only, no archive. Used to distribute recognized revenue across periods.
**API lines:** 10278–10362

**AutomaticInvoicingRule (`automatic_invoicing_rules`):** Configures automatic invoice generation for a budget. Fields: `budget_id`, `reference_date`, `creation_offset`, `creation_offset_unit`, `skip_weekends`.
**API lines:** 1867–1963

**PaymentReminderSequence (`payment_reminder_sequences`):** Defines a sequence of reminder emails for unpaid invoices. Fields: `name`, `default_sequence` (boolean). Child payment reminders (up to 3) are embedded. POST/GET `/payment_reminder_sequences`, GET/PATCH/DELETE `/{id}`.
**API lines:** 7772–7892

**EinvoiceIdentity (`einvoice_identities`):** PEPPOL / DIR3 routing identifiers for a subsidiary. Fields: `peppol_id`, `dire_code`, `company_id`, `subsidiary_id`, `buyer_reference`, `dir3_fiscal_code`, `dir3_pagador_code`, `dir3_receptor_code`, `is_government_entity`.
**API lines:** 4489–4560

---

### MCP Tool List — Org Structure

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_subsidiaries` | GET /subsidiaries | — |
| `get_subsidiary` | GET /subsidiaries/{id} | — |
| `create_subsidiary` | POST /subsidiaries | — |
| `update_subsidiary` | PATCH /subsidiaries/{id} | — |
| `archive_subsidiary` | PATCH /subsidiaries/{id}/archive | yes |
| `list_teams` | GET /teams | — |
| `get_team` | GET /teams/{id} | — |
| `create_team` | POST /teams | — |
| `update_team` | PATCH /teams/{id} | — |
| `delete_team` | DELETE /teams/{id} | yes |
| `list_team_memberships` | GET /team_memberships | — |
| `create_team_membership` | POST /team_memberships | — |
| `delete_team_membership` | DELETE /team_memberships/{id} | yes |
| `list_holiday_calendars` | GET /holiday_calendars | — |
| `create_holiday_calendar` | POST /holiday_calendars | — |
| `update_holiday_calendar` | PATCH /holiday_calendars/{id} | — |
| `list_holidays` | GET /holidays | — |
| `create_holiday` | POST /holidays | — |
| `update_holiday` | PATCH /holidays/{id} | — |
| `delete_holiday` | DELETE /holidays/{id} | yes |
| `list_roles` | GET /roles | — |
| `get_role` | GET /roles/{id} | — |
| `create_role` | POST /roles | — |
| `update_role` | PATCH /roles/{id} | — |
| `delete_role` | DELETE /roles/{id} | yes |
| `list_bank_accounts` | GET /bank_accounts | — |
| `create_bank_account` | POST /bank_accounts | — |
| `update_bank_account` | PATCH /bank_accounts/{id} | — |
| `archive_bank_account` | PATCH /bank_accounts/{id}/archive | yes |
| `restore_bank_account` | PATCH /bank_accounts/{id}/restore | — |
| `list_payment_reminder_sequences` | GET /payment_reminder_sequences | — |
| `create_payment_reminder_sequence` | POST /payment_reminder_sequences | — |
| `update_payment_reminder_sequence` | PATCH /payment_reminder_sequences/{id} | — |
| `list_einvoice_identities` | GET /einvoice_identities | — |
| `create_einvoice_identity` | POST /einvoice_identities | — |
| `update_einvoice_identity` | PATCH /einvoice_identities/{id} | — |
| `list_revenue_distributions` | GET /revenue_distributions | — |
| `create_revenue_distribution` | POST /revenue_distributions | — |
| `update_revenue_distribution` | PATCH /revenue_distributions/{id} | — |
| `delete_revenue_distribution` | DELETE /revenue_distributions/{id} | yes |
| `list_automatic_invoicing_rules` | GET /automatic_invoicing_rules | — |
| `create_automatic_invoicing_rule` | POST /automatic_invoicing_rules | — |
| `update_automatic_invoicing_rule` | PATCH /automatic_invoicing_rules/{id} | — |
| `delete_automatic_invoicing_rule` | DELETE /automatic_invoicing_rules/{id} | yes |

---

## 9. Custom Fields

### 9.1 Data Model

**CustomField (`custom_fields`):**

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | **required** |
| `data_type_id` | integer (enum 1–7) | **required** — 1=text, 2=number, 3=date, 4=dropdown, 5=multi-select, 6=person, 7=file |
| `customizable_type` | string | **required** — `"Task"`, `"Project"`, `"Person"`, `"Invoice"`, `"Expense"`, `"Booking"` etc. |
| `global` | boolean | Org-wide vs. project-scoped |
| `project_id` | integer | Scopes field to a project |
| `section_id` | integer | Groups field in UI |
| `required` | boolean | |
| `sensitive` | boolean | Hides value from non-admins |
| `position` | integer | |
| `show_in_add_edit_views` | boolean | |
| `quick_add_enabled` | boolean | |
| `formatting_type_id` | integer (enum 1–2) | |
| `aggregation_type_id` | integer | |
| `archived_at` | datetime | |

**Relationships:** `options` (for dropdown/multi-select), `section`, `project`, `organization`

**CustomFieldOption (`custom_field_options`):**

| Field | Notes |
|-------|-------|
| `name` | **required** |
| `custom_field_id` | **required** |
| `color_id` | |
| `position` | |

**CustomFieldSection (`custom_field_sections`):**

Groups custom fields in the UI. Fields: `name`, `customizable_type`, `position`.

### 9.2 How custom fields appear on other resources

All resources that support custom fields carry a `custom_fields` hash attribute. This is a key-value map where keys are custom field IDs (as strings). Values depend on `data_type_id`:

- Text: `"2024 Q1 note"`
- Number: `42`
- Date: `"2026-03-15"`
- Dropdown: option ID integer
- Multi-select: array of option ID integers
- Person: person ID integer
- File: attachment ID integer

Resources with `custom_fields` support include: `Task`, `Project`, `Person`, `Invoice`, `Expense`, `Booking`, `Service`, `TimeEntry` (indirect via service), `Survey` responses.

**Archive behaviour:** `PATCH /custom_fields/{id}/archive` soft-archives the field. Options and sections have their own archive endpoints. Archived fields stop appearing in forms but historical data is preserved.

**API lines:**
- `custom_fields`: 3206–3346, 105088–105135
- `custom_field_options`: 3098–3187, 103319–103342
- `custom_field_sections`: 3241–3345, 104116–104136

---

### MCP Tool List — Custom Fields

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_custom_fields` | GET /custom_fields | — |
| `get_custom_field` | GET /custom_fields/{id} | — |
| `create_custom_field` | POST /custom_fields | — |
| `update_custom_field` | PATCH /custom_fields/{id} | — |
| `archive_custom_field` | PATCH /custom_fields/{id}/archive | yes |
| `list_custom_field_options` | GET /custom_field_options | — |
| `create_custom_field_option` | POST /custom_field_options | — |
| `update_custom_field_option` | PATCH /custom_field_options/{id} | — |
| `archive_custom_field_option` | PATCH /custom_field_options/{id}/archive | yes |
| `list_custom_field_sections` | GET /custom_field_sections | — |
| `create_custom_field_section` | POST /custom_field_sections | — |
| `update_custom_field_section` | PATCH /custom_field_sections/{id} | — |
| `archive_custom_field_section` | PATCH /custom_field_sections/{id}/archive | yes |

---

## 10. Tags

**Resource type:** `tags`

Labels applied to companies, deals, invoices, people, projects, or tasks for categorization.

**Attributes:**

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Tag name |
| `color_id` | integer | Visual color |
| `taggable_type` | string | Resource type it is applied to |
| `task_id` | integer | Set if applied to a task |
| `deal_id` | integer | Set if applied to a deal |
| `invoice_id` | integer | Set if applied to an invoice |
| `person_id` | integer | Set if applied to a person |
| `company_id` | integer | Set if applied to a company |
| `project_id` | integer | Set if applied to a project |

**Endpoints:** GET `/tags` (list), GET `/tags/{id}` (show). Tags are created/managed via the `tag_list` attribute on the parent resource (e.g. `invoice.tag_list`), not via a direct POST to `/tags`.

**Filters:** `name`, `taggable_type`, `task_id`, `deal_id`, etc.

**API lines:** 11618–11649, resource schema: 41356–41422

---

### MCP Tool List — Tags

| Tool | Operation | Elicitation |
|------|-----------|-------------|
| `list_tags` | GET /tags | — |
| `get_tag` | GET /tags/{id} | — |

---

## 11. Recommended Tool Inventory

Flat list ordered by family and rough implementation complexity (L = low / M = medium / H = high).

| # | Tool Name | Family | Complexity |
|---|-----------|--------|------------|
| 1 | `list_approval_policies` | approval | L |
| 2 | `get_approval_policy` | approval | L |
| 3 | `create_approval_policy` | approval | M |
| 4 | `update_approval_policy` | approval | M |
| 5 | `archive_approval_policy` | approval | M |
| 6 | `restore_approval_policy` | approval | L |
| 7 | `list_approval_policy_assignments` | approval | L |
| 8 | `get_approval_policy_assignment` | approval | L |
| 9 | `create_approval_policy_assignment` | approval | M |
| 10 | `update_approval_policy_assignment` | approval | M |
| 11 | `delete_approval_policy_assignment` | approval | M |
| 12 | `get_approval_workflow` | approval | L |
| 13 | `create_approval_workflow` | approval | M |
| 14 | `update_approval_workflow` | approval | M |
| 15 | `delete_approval_workflow` | approval | M |
| 16 | `list_time_entries` | approval | L |
| 17 | `get_time_entry` | approval | L |
| 18 | `approve_time_entry` | approval | M |
| 19 | `bulk_approve_time_entries` | approval | H |
| 20 | `unapprove_time_entry` | approval | M |
| 21 | `bulk_unapprove_time_entries` | approval | H |
| 22 | `reject_time_entry` | approval | M |
| 23 | `unreject_time_entry` | approval | M |
| 24 | `list_expenses` | approval | L |
| 25 | `get_expense` | approval | L |
| 26 | `create_expense` | approval | M |
| 27 | `update_expense` | approval | M |
| 28 | `delete_expense` | approval | M |
| 29 | `approve_expense` | approval | M |
| 30 | `bulk_approve_expenses` | approval | H |
| 31 | `reject_expense` | approval | M |
| 32 | `unapprove_expense` | approval | M |
| 33 | `unreject_expense` | approval | M |
| 34 | `unapprove_booking` | approval | M |
| 35 | `list_bills` | finance | L |
| 36 | `get_bill` | finance | L |
| 37 | `create_bill` | finance | M |
| 38 | `update_bill` | finance | M |
| 39 | `delete_bill` | finance | M |
| 40 | `list_payments` | finance | L |
| 41 | `get_payment` | finance | L |
| 42 | `create_payment` | finance | M |
| 43 | `update_payment` | finance | M |
| 44 | `delete_payment` | finance | M |
| 45 | `list_purchase_orders` | finance | L |
| 46 | `get_purchase_order` | finance | L |
| 47 | `create_purchase_order` | finance | M |
| 48 | `update_purchase_order` | finance | M |
| 49 | `delete_purchase_order` | finance | M |
| 50 | `copy_purchase_order` | finance | M |
| 51 | `send_purchase_order` | finance | H |
| 52 | `export_purchase_order` | finance | M |
| 53 | `list_line_items` | finance | L |
| 54 | `get_line_item` | finance | L |
| 55 | `create_line_item` | finance | M |
| 56 | `update_line_item` | finance | M |
| 57 | `delete_line_item` | finance | M |
| 58 | `generate_line_items` | finance | H |
| 59 | `list_invoices` | finance | L |
| 60 | `get_invoice` | finance | L |
| 61 | `create_invoice` | finance | M |
| 62 | `update_invoice` | finance | M |
| 63 | `delete_invoice` | finance | M |
| 64 | `preview_invoice` | finance | M |
| 65 | `finalize_invoice` | finance | H |
| 66 | `send_invoice` | finance | H |
| 67 | `send_einvoice` | finance | H |
| 68 | `list_invoice_attributions` | finance | L |
| 69 | `create_invoice_attribution` | finance | M |
| 70 | `update_invoice_attribution` | finance | M |
| 71 | `delete_invoice_attribution` | finance | M |
| 72 | `list_invoice_templates` | finance | L |
| 73 | `get_invoice_template` | finance | L |
| 74 | `create_invoice_template` | finance | M |
| 75 | `update_invoice_template` | finance | M |
| 76 | `delete_invoice_template` | finance | M |
| 77 | `list_tax_rates` | finance | L |
| 78 | `get_tax_rate` | finance | L |
| 79 | `create_tax_rate` | finance | M |
| 80 | `update_tax_rate` | finance | M |
| 81 | `archive_tax_rate` | finance | M |
| 82 | `restore_tax_rate` | finance | L |
| 83 | `list_exchange_rates` | finance | L |
| 84 | `list_payment_reminder_sequences` | finance | L |
| 85 | `create_payment_reminder_sequence` | finance | M |
| 86 | `update_payment_reminder_sequence` | finance | M |
| 87 | `list_einvoice_identities` | finance | L |
| 88 | `create_einvoice_identity` | finance | M |
| 89 | `update_einvoice_identity` | finance | M |
| 90 | `list_bank_accounts` | finance | L |
| 91 | `create_bank_account` | finance | M |
| 92 | `update_bank_account` | finance | M |
| 93 | `archive_bank_account` | finance | M |
| 94 | `restore_bank_account` | finance | L |
| 95 | `list_revenue_distributions` | finance | L |
| 96 | `create_revenue_distribution` | finance | M |
| 97 | `update_revenue_distribution` | finance | M |
| 98 | `delete_revenue_distribution` | finance | M |
| 99 | `list_automatic_invoicing_rules` | finance | L |
| 100 | `create_automatic_invoicing_rule` | finance | M |
| 101 | `update_automatic_invoicing_rule` | finance | M |
| 102 | `delete_automatic_invoicing_rule` | finance | M |
| 103 | `list_subsidiaries` | org | L |
| 104 | `get_subsidiary` | org | L |
| 105 | `create_subsidiary` | org | M |
| 106 | `update_subsidiary` | org | M |
| 107 | `archive_subsidiary` | org | M |
| 108 | `list_teams` | org | L |
| 109 | `get_team` | org | L |
| 110 | `create_team` | org | L |
| 111 | `update_team` | org | L |
| 112 | `delete_team` | org | M |
| 113 | `list_team_memberships` | org | L |
| 114 | `create_team_membership` | org | L |
| 115 | `delete_team_membership` | org | M |
| 116 | `list_holiday_calendars` | org | L |
| 117 | `create_holiday_calendar` | org | L |
| 118 | `update_holiday_calendar` | org | L |
| 119 | `list_holidays` | org | L |
| 120 | `create_holiday` | org | L |
| 121 | `update_holiday` | org | L |
| 122 | `delete_holiday` | org | M |
| 123 | `list_roles` | org | L |
| 124 | `get_role` | org | L |
| 125 | `create_role` | org | M |
| 126 | `update_role` | org | M |
| 127 | `delete_role` | org | M |
| 128 | `list_custom_fields` | org | L |
| 129 | `get_custom_field` | org | L |
| 130 | `create_custom_field` | org | M |
| 131 | `update_custom_field` | org | M |
| 132 | `archive_custom_field` | org | M |
| 133 | `list_custom_field_options` | org | L |
| 134 | `create_custom_field_option` | org | L |
| 135 | `update_custom_field_option` | org | L |
| 136 | `archive_custom_field_option` | org | M |
| 137 | `list_custom_field_sections` | org | L |
| 138 | `create_custom_field_section` | org | L |
| 139 | `update_custom_field_section` | org | L |
| 140 | `archive_custom_field_section` | org | M |
| 141 | `list_tags` | org | L |
| 142 | `get_tag` | org | L |

**Total: 142 tools** (approval: 34, finance: 68, org: 40)

**Implementation priority suggestion:**
- Phase 1 (daily use): 16–23 (time entry approvals), 24–33 (expense approvals), 59–66 (invoice lifecycle)
- Phase 2 (finance admin): 35–52 (bills/payments/POs), 53–58 (line items), 77–83 (tax+FX)
- Phase 3 (org setup): 1–15 (approval policies), 103–127 (subsidiaries/teams/holidays/roles)
- Phase 4 (metadata): 128–142 (custom fields, tags)

---

## 12. References

All line numbers refer to `/Users/ruben/Developer/productive-mcp/api-master.yaml`.

| Resource | Path definition | Request body schema | Resource schema |
|----------|----------------|--------------------|--------------------|
| approval_policies | 1465–1596 | 102311–102335 | 41579–41647 |
| approval_policy_assignments | 1597–1693 | 101745–101759 | 24435–24476 |
| approval_workflows | 1694–1769 | 102643–102671 | 45439–45566 |
| time_entries (state transitions) | 12402–12646 | 104918–104965 | 69693–70050 |
| expenses (state transitions) | 4889–5149 | 102672–102730 | 47546–48000 |
| bookings/unapprove | 2505 | — | — |
| bills | 2128–2211 | 103217–103243 | 31491–31640 |
| payments | 7893–7927 | 103344–103369 | 95589–95720 |
| purchase_orders | 9249–9437 | 102122–102168 | 69352–69690 |
| purchase_order send body | 9437 | 102010–102056 | — |
| line_items | 6397–6535 | 104419–104462 | (inline) |
| invoices | 6035–6299 | 104733–104811 | 19687–20000 |
| invoice_attributions | 5938–6034 | 104598–104624 | — |
| invoice_templates | 6300–6395 | (inline) | — |
| tax_rates | 12071–12234 | 104966–104993 | (inline) |
| exchange_rates | 4875–4888 | — | 95553–95588 |
| payment_reminder_sequences | 7772–7892 | 101687–101703 | — |
| einvoice_identities | 4489–4560 | 101889–101918 | — |
| bank_accounts | 1964–2127 | 105136–105162 | — |
| revenue_distributions | 10278–10362 | — | — |
| automatic_invoicing_rules | 1867–1963 | 101987–102009 | — |
| subsidiaries | 11153–11258 | 101850–101886 | 78019–78160 |
| teams | 12305–12401 | 103450–103471 | 24495–24548 |
| team_memberships | 12235–12304 | 102990–103000 | — |
| holidays | 5542–5619 | 103507–103529 | — |
| holiday_calendars | 5445–5541 | — | — |
| roles | 10363–10440 | 103294–103318 | 78820–78900 |
| custom_fields | 3188–3346 | 105088–105135 | 74413–74580 |
| custom_field_options | 3098–3187 | 103319–103342 | — |
| custom_field_sections | 3241–3302 | 104116–104136 | — |
| tags | 11618–11649 | — | 41356–41422 |
| filter_time_entry | — | — | 43707–45100 |
| filter_expense | — | — | 45567–46500 |
| filter_approval_policy | — | — | 61949–62300 |
| filter_approval_policy_assignment | — | — | 84026–84400 |
