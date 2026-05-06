# Productive API — Reports Endpoints Reference

Source: `api-master.yaml` (read directly)
Covers: 24 `GET /api/v2/reports/*` endpoints

---

## 1. Summary

All 24 report endpoints share the same shape:

- **Method**: `GET`
- **Path**: `/api/v2/reports/{report_type}`
- **Auth**: `X-Organization-Id` header (required on every call — `$ref: header_organization`)
- **Query params**: `filter` (deepObject), `group` (enum string), `sort` (array of strings)
- **Response**: JSON:API collection — `data[].attributes` contains metrics + dimension labels
- **Pagination**: standard JSON:API `links.next` / `meta.total_count`

Every endpoint follows the pattern:
```
GET /api/v2/reports/booking_reports
  ?group=person
  &filter[project_id][]=123
  &filter[started_on_after]=2025-01-01
  &sort[]=total_cost
```

The `group` parameter is a single enum value — it controls the aggregation dimension (one row per group member). There is no multi-group support in the spec; each call returns one grouping level at a time.

The `filter` parameter is a `deepObject` using `filter[field][operator]=value` notation. Logical AND/OR grouping is supported via the `$op` advanced filter shape.

---

## 2. Common Report Patterns

### 2.1 Grouping

Every report has a `group` parameter whose schema is a single `enum` string. The group value controls what each row represents — e.g. `group=person` means one aggregated row per person. The response `attributes.group` field carries the label/ID of the group member.

### 2.2 Filter operators

All filter fields support: `eq`, `not_eq`, `contains`, `not_contain`. Date fields additionally support `gt`, `lt`, `gte`, `lte` operators. Filters are passed as deepObject: `filter[field][eq]=value` or `filter[field][]=value` (shorthand for array membership).

Advanced logical groups use:
```
filter[$op]=and
filter[0][field][eq]=value
filter[1][field][eq]=value
```

### 2.3 Currency normalisation

Reports that include monetary fields expose three variants of each money field:
- `total_cost` — in the record's native currency
- `total_cost_default` — converted to the organisation's default currency
- `total_cost_normalized` — normalised (cross-currency comparable)

### 2.4 Date filtering patterns

Reports use different field names for date ranges depending on domain:

| Domain | Date filter fields |
|---|---|
| Bookings | `started_on`, `started_on_after`, `started_on_before`, `ended_on`, `date`, `date_after` |
| Time entries | `date`, `after`, `started_at`, `started_after`, `ended_at`, `approved_at` |
| Time (new) | `after`, `before`, `day`, `week`, `month`, `quarter`, `year` |
| Timesheets | `after`, `before` |
| Expenses | `date`, `pay_on`, `pay_on_before`, `paid_on`, `approved_at` |
| Invoices | `sent_on`, `delivery_on`, `created_at` |
| Payments | `paid_on`, `paid_before`, `paid_after`, `written_off_on` |
| Tasks | `date_range`, `due_date_before`, `start_date_before`, `closed_after`, `closed_before` |
| Salary | `date`, `started_on`, `ended_on` |
| Payroll items | `date` |
| Deals | `date`, `end_date`, `lost_at` |

### 2.5 Billable / billing type distinction

| Report | Billable filter | Notes |
|---|---|---|
| `time_entry_reports` | `filter[billable]=true/false` | Direct boolean filter |
| `time_reports` (new) | `filter[billing_type]=…` | Enum: billable/non-billable/internal |
| `service_reports` | `filter[billable]=true/false` | Direct boolean filter |
| `financial_item_reports` | `filter[billing_type]=…` | Enum field |
| `booking_reports` | `filter[billing_type_id][]=…` | ID reference to billing type |

### 2.6 Sort fields

Sort accepts an array: `sort[]=field` or `sort[]=-field` (prefix `-` for descending). The spec enumerates allowed sort values per report. Most reports allow sorting on both dimension labels (e.g. `company`, `person`) and aggregated metrics (e.g. `total_cost`, `average_profit_margin`).

`deal_funnel_reports` is the only report where sort schema has no enum — it accepts free-form string array.

---

## 3. Per-Endpoint Reference

### 3.1 `booking_reports`

**Path**: `GET /api/v2/reports/booking_reports`
**operationId**: `reports-booking_reports-index`
**Description**: Aggregated booking data — scheduled time, cost, and utilisation grouped by configurable dimensions.

**Filter fields** (`filter[*]`):
`ended_on`, `service_type_id`, `stage_type`, `tags`, `service_id`, `created_at`, `parent_company_id`, `people_custom_fields`, `canceled_at`, `formulas`, `billing_type_id`, `absence_type`, `started_on_after`, `before`, `started_on_before`, `approval_status`, `approved_at`, `started_on`, `with_draft`, `rejected_at`, `task_id`, `company_id`, `date_after`, `project_id`, `date`

**Date fields**: `started_on`, `started_on_after`, `started_on_before`, `ended_on`, `date`, `date_after`, `approved_at`, `canceled_at`, `rejected_at`

**Group dimensions** (`group=`):
`absence_type`, `approval_status`, `approved_at`, `autotracking`, `billing_type`, `booking`, `budget`, `canceled_at`, `company`, `created_at`, `custom_fields`, `date`, `draft`, `event`, `organization`, `people_custom_fields`, `person`, `project`, `project_type`, `rejected_at`, `responsible`, `service`, `service_type`, `stage_type`, `task`

**Sort fields** (sample): `absence_type`, `approval_status`, `average_blended_rate`, `average_recognized_margin`, `billing_type`, `booking`, `total_cost`, `total_recognized_revenue`, `total_recognized_profit`, `time`, `mandays`

**Response attributes** (key metrics): `time`, `count`, `mandays`, `total_cost`, `total_base_cost`, `average_blended_rate`, `average_recognized_margin`, `total_recognized_time`, `total_recognized_profit`, `total_recognized_revenue`, `draft`, `stage_type`, `absence_type`, `billing_type`, `project_type`, `approval_status`, `currency`, `start_date`, `end_date`, `date_period` (plus `_default` and `_normalized` money variants)

**Billable**: via `billing_type_id` filter (ID reference) or `billing_type` group dimension

**Proposed MCP tool**: `get_booking_report`
- description: "Retrieve aggregated booking/scheduling data from Productive, grouped by a configurable dimension such as person, project, service, or date."
- key params: `group` (enum), `project_id`, `person_id`, `service_id`, `company_id`, `billing_type_id`, `stage_type`, `started_on_after`, `started_on_before`, `date`, `sort`, `page`
- output: `{ rows: [{ group, time, mandays, total_cost, average_blended_rate, currency, … }], total_count }`

---

### 3.2 `budget_reports`

**Path**: `GET /api/v2/reports/budget_reports`
**operationId**: `reports-budget_reports-index`
**Description**: Aggregated budget metrics — revenues, costs, invoiced amounts, forecasted usage, and profit grouped by budget dimensions.

**Filter fields**: `previous_probability`, `sales_closed_on`, `name`, `subscriber_id`, `needs_closing`, `parent_company_id`, `forecasted_budget_usage`, `query`, `future_cost`, `color_id`, `tracking_type_id`, `discount`, `needs_invoicing`, `days_since_last_activity`, `recurring_ends_on`, `unapproved_time`, `template`, `project_id`, `forecasted_profit`, `company_id`, `future_budget_used`, `retainer_interval`, `last_activity_at`, `recurring`, `status_id`

**Date fields**: `sales_closed_on`, `recurring_ends_on`, `last_activity_at`

**Group dimensions**: `budget`, `closed_at`, `company`, `contract`, `created_at`, `custom_fields`, `date`, `deal_type`, `delivered_on`, `designated_approver`, `end_date`, `last_activity_at`, `month`, `next_occurrence_on`, `organization`, `origin_deal`, `primary_contact`, `project`, `project_type`, `purchase_order_number`, `quarter`, `recurring`, `recurring_ends_on`, `recurring_interval`, `recurring_starts_on`, `responsible`, `revenue_distribution_type`, `status`, `subsidiary`, `tracking_type_id`, `week`, `year`

**Sort fields** (sample): `budget`, `total_revenue`, `total_cost`, `total_profit`, `total_invoiced`, `total_budget_used`, `total_budget_total`, `average_profit_margin`, `average_actual_rate`, `average_invoiced_percentage`, `average_budget_usage`, `average_forecasted_budget_usage`, `total_forecasted_budget_overrun`

**Response attributes** (key metrics): `total_revenue`, `total_cost`, `total_profit`, `total_invoiced`, `total_draft_invoiced`, `total_budget_used`, `total_budget_total`, `total_budget_remaining`, `total_worked_time`, `total_billable_time`, `total_estimated_time`, `total_estimated_cost`, `total_forecasted_cost`, `total_services_revenue`, `total_expense`, `total_credited`, `average_profit_margin`, `average_actual_rate`, `average_invoiced_rate`, `average_invoiced_percentage`, `average_budget_usage`, `average_forecasted_budget_usage`, `average_forecasted_budget_overrun`, `week`, `month`, `quarter`, `year`, `status`, `recurring`, `deal_type` (plus currency variants)

**Billable**: No direct billable filter. Billable/non-billable splits are in response attributes (`total_billable_time`).

**Proposed MCP tool**: `get_budget_report`
- description: "Retrieve aggregated budget performance data from Productive — revenues, costs, invoiced amounts, and forecasted metrics grouped by project, company, responsible, status, or time period."
- key params: `group` (enum), `project_id`, `company_id`, `status_id`, `tracking_type_id`, `recurring`, `needs_invoicing`, `needs_closing`, `sort`, `page`
- output: `{ rows: [{ group, total_revenue, total_cost, total_profit, total_invoiced, average_profit_margin, … }], total_count }`

---

### 3.3 `company_reports`

**Path**: `GET /api/v2/reports/company_reports`
**operationId**: `reports-company_reports-index`
**Description**: Aggregated company data — contact details and activity grouped by configurable dimensions.

**Filter fields**: `id`, `subscriber_id`, `archived_at`, `project_id`, `fuzzy_people`, `vat`, `has_parent_company`, `tags`, `parent_company_id`, `subsidiary_id`, `default_tax_rate_id`, `jump_query`, `exclude_company_and_children`, `payment_terms`, `full_query`, `custom_fields`, `default_currency`, `company_id`, `name`, `default_subsidiary_id`, `fuzzy_dates`, `query`, `due_days`, `status`, `last_activity_at`

**Date fields**: `archived_at`, `last_activity_at`, `fuzzy_dates`

**Group dimensions**: `company`, `contact_address`, `contact_city`, `contact_country`, `contact_email`, `contact_phone`, `contact_state`, `contact_website`, `contact_zipcode`, `created_at`, `custom_fields`, `last_activity_at`, `month`, `organization`, `parent_company`, `quarter`, `status`, `subsidiary`, `week`, `year`

**Sort fields** (sample): `company`, `company_name`, `company_created_at`, `company_last_activity_at`, `contact_country`, `count`, `status`

**Response attributes**: `count`, `group`, `status`, `currency`, `week`, `month`, `quarter`, `year`, `contact_address`, `contact_city`, `contact_country`, `contact_email`, `contact_phone`, `contact_state`, `contact_website`, `contact_zipcode`, `custom_fields`, `created_at_period`, `last_activity_at_period` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_company_report`
- description: "Retrieve aggregated company CRM data from Productive — counts, contact information, and activity metrics grouped by company, country, status, or subsidiary."
- key params: `group` (enum), `company_id`, `parent_company_id`, `subsidiary_id`, `status`, `has_parent_company`, `name`, `query`, `sort`, `page`
- output: `{ rows: [{ group, count, status, contact_country, last_activity_at_period, … }], total_count }`

---

### 3.4 `deal_funnel_reports`

**Path**: `GET /api/v2/reports/deal_funnel_reports`
**operationId**: `reports-deal_funnel_reports-index`
**Description**: Aggregated deal pipeline/funnel data — counts, lost counts, and total values grouped by pipeline and stage.

**Filter fields**: `pipeline_id`, `projected_revenue`, `date`, `created_at`, `budget_total`, `formulas`, `id`

**Date fields**: `date`, `created_at`

**Group dimensions**: `deal_funnel`, `deal_status`, `organization`, `pipeline`

**Sort fields**: Free-form string array (no enum specified in spec).

**Response attributes**: `count`, `lost_count`, `group`, `currency`, `total_budget_total`, `total_projected_revenue` (plus `_default` and `_normalized` money variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_deal_funnel_report`
- description: "Retrieve deal pipeline funnel data from Productive — deal counts, lost counts, and total revenue values grouped by pipeline or deal status."
- key params: `group` (enum), `pipeline_id`, `date`, `created_at`, `sort`, `page`
- output: `{ rows: [{ group, count, lost_count, total_projected_revenue, total_budget_total, currency, … }], total_count }`

---

### 3.5 `deal_reports`

**Path**: `GET /api/v2/reports/deal_reports`
**operationId**: `reports-deal_reports-index`
**Description**: Aggregated deal/sales performance data — revenues, costs, and stage metrics grouped by configurable dimensions.

**Filter fields**: `designated_approver_id`, `needs_invoicing`, `template`, `lost_reason_id`, `forecasted_budget_usage`, `forecasted_revenue`, `accessible_by_person`, `tracking_type_id`, `retainer`, `projected_revenue`, `services_revenue`, `date`, `end_date`, `number`, `next_occurrence_on`, `pending_invoicing`, `lost_at`, `approval_policy_id`, `stage_status_id`, `future_revenue`, `status_id`, `fuzzy_dates`, `future_cost`, `todo_due_date`, `purchase_order_number`

**Date fields**: `date`, `end_date`, `lost_at`, `next_occurrence_on`, `fuzzy_dates`

**Group dimensions**: `company`, `contact`, `created_at`, `creator`, `custom_fields`, `date`, `deal`, `deal_status`, `designated_approver`, `last_activity_at`, `lost_reason`, `month`, `organization`, `pipeline`, `previous_deal_status`, `primary_contact`, `project`, `quarter`, `responsible`, `sales_closed_at`, `sales_closed_on`, `sales_status_id`, `stage_status_id`, `stage_updated_at`, `subsidiary`, `tracking_type_id`, `week`, `year`

**Sort fields** (sample): `deal`, `company`, `total_revenue`, `total_cost`, `total_profit`, `total_budget_total`, `total_projected_revenue`, `average_actual_rate`, `average_days_in_current_stage`, `average_days_since_created`, `average_days_since_last_activity`, `count`, `probability`

**Response attributes** (key metrics): `total_revenue`, `total_cost`, `total_profit`, `total_budget_total`, `total_budget_used`, `total_projected_revenue`, `total_worked_time`, `total_billable_time`, `total_estimated_time`, `total_estimated_cost`, `total_services_revenue`, `total_expense`, `total_work_cost`, `average_actual_rate`, `average_rate`, `average_days_in_current_stage`, `average_days_since_created`, `previous_probability`, `probability`, `retainer`, `tracking_type_id`, `week`, `month`, `quarter`, `year`, `stage_status_id`, `date_period`, `sales_closed_at_period` (plus currency variants)

**Billable**: Not a direct filter. `total_billable_time` is in response attributes.

**Proposed MCP tool**: `get_deal_report`
- description: "Retrieve aggregated deal/sales analytics from Productive — revenues, pipeline metrics, and conversion data grouped by deal, company, stage, responsible, or time period."
- key params: `group` (enum), `status_id`, `stage_status_id`, `tracking_type_id`, `date`, `end_date`, `needs_invoicing`, `pending_invoicing`, `sort`, `page`
- output: `{ rows: [{ group, total_revenue, total_projected_revenue, total_cost, total_profit, probability, average_days_in_current_stage, … }], total_count }`

---

### 3.6 `entitlement_reports`

**Path**: `GET /api/v2/reports/entitlement_reports`
**operationId**: `reports-entitlement_reports-index`
**Description**: Aggregated leave/entitlement data — allocated, used, pending, and available time grouped by person, absence type, or date range.

**Filter fields**: `person_id`, `used`, `formulas`, `allocated`, `end_date`, `event_id`, `date`, `start_date`, `absence_type`, `id` (note: `id` appears twice in the spec — likely a spec defect)

**Date fields**: `date`, `start_date`, `end_date`

**Group dimensions**: `absence_type`, `end_date`, `entitlement`, `event`, `organization`, `people_custom_fields`, `person`, `start_date`, `subsidiary`

**Sort fields**: `absence_type`, `count`, `end_date`, `entitlement`, `entitlement_end_date`, `entitlement_start_date`, `event`, `people_custom_fields`, `person`, `start_date`, `subsidiary`, `total_allocated`, `total_allocated_minutes`, `total_available`, `total_available_minutes`, `total_pending`, `total_pending_minutes`, `total_used`, `total_used_minutes`

**Response attributes**: `count`, `group`, `total_allocated`, `total_allocated_minutes`, `total_used`, `total_used_minutes`, `total_pending`, `total_pending_minutes`, `total_available`, `total_available_minutes`, `absence_type`, `currency`, `end_date_period`, `start_date_period`, `people_custom_fields` (plus currency variants)

**Billable**: Not applicable (leave management domain).

**Proposed MCP tool**: `get_entitlement_report`
- description: "Retrieve aggregated leave/entitlement data from Productive — allocated, used, pending, and available time grouped by person, absence type, or date range."
- key params: `group` (enum), `person_id`, `event_id`, `absence_type`, `date`, `start_date`, `end_date`, `sort`, `page`
- output: `{ rows: [{ group, absence_type, total_allocated, total_used, total_pending, total_available, … }], total_count }`

---

### 3.7 `expense_reports`

**Path**: `GET /api/v2/reports/expense_reports`
**operationId**: `reports-expense_reports-index`
**Description**: Aggregated expense data — amounts, tax, profit, and billable amounts grouped by configurable dimensions.

**Filter fields**: `pay_on_before`, `id`, `pay_on`, `export_status`, `date`, `invoicing_status`, `status`, `billable_amount`, `approved_at`, `quantity`, `jump_query`, `paid_on`, `assigned_approver_id`, `awaiting_approval_from_approver_id`, `fuzzy_dates`, `vendor_id`, `full_query`, `reimbursement`, `service_type_id`, `creator_id`, `recognized_revenue`, `invoiced`, `profit`, `formulas`, `fuzzy_people`

**Date fields**: `date`, `pay_on`, `pay_on_before`, `paid_on`, `approved_at`, `fuzzy_dates`

**Group dimensions**: `approval_status`, `approved_at`, `approver`, `company`, `created_at`, `creator`, `custom_fields`, `date`, `deal`, `designated_approver`, `expense`, `invoice`, `invoiced`, `invoicing_status`, `month`, `organization`, `paid_on`, `pay_on`, `person`, `project`, `purchase_order`, `quarter`, `quote_type`, `reimbursed_on`, `reimbursement`, `responsible`, `section_name`, `service`, `service_type`, `stage_type`, `status`, `tax_rate`, `vendor`, `week`, `year`

**Sort fields** (sample): `approval_status`, `approved_at`, `approver`, `average_profit_margin`, `company`, `count`, `total_amount`, `total_amount_with_tax`, `total_billable_amount`, `total_profit`, `total_recognized_revenue`, `total_tax_amount`

**Response attributes** (key metrics): `total_amount`, `total_amount_with_tax`, `total_tax_amount`, `total_profit`, `total_billable_amount`, `total_recognized_revenue`, `average_profit_margin`, `count`, `invoiced`, `invoicing_status`, `reimbursement`, `status`, `approval_status`, `stage_type`, `week`, `month`, `quarter`, `year`, `date_period`, `paid_on_period`, `pay_on_period`, `approved_at_period` (plus currency variants)

**Billable**: `billable_amount` filter available (filter by billable amount value); `total_billable_amount` in response.

**Proposed MCP tool**: `get_expense_report`
- description: "Retrieve aggregated expense data from Productive — amounts, tax, profit, and billable figures grouped by project, company, person, status, or time period."
- key params: `group` (enum), `status`, `invoicing_status`, `reimbursement`, `date`, `pay_on`, `paid_on`, `pay_on_before`, `vendor_id`, `creator_id`, `sort`, `page`
- output: `{ rows: [{ group, total_amount, total_amount_with_tax, total_billable_amount, total_profit, average_profit_margin, … }], total_count }`

---

### 3.8 `financial_item_reports`

**Path**: `GET /api/v2/reports/financial_item_reports`
**operationId**: `reports-financial_item_reports-index`
**Description**: Aggregated financial item data — time, cost, revenue, scheduled vs worked, and invoicing metrics across all financial item types (time entries, expenses, line items).

**Filter fields**: `total_time`, `invoiced`, `service_id`, `approval_status`, `budget_total`, `total_recognized_time`, `budget_id`, `scheduled_cost`, `future`, `draft_invoiced`, `section_id`, `billing_type`, `project_type_id`, `probability`, `unit`, `person_id`, `locked`, `project_id`, `overhead_cost`, `profit`, `cost`, `stage_type`, `pipeline_id`, `budget_status`, `custom_fields`

**Date fields**: None explicitly in filter — date context provided through `future` boolean and inherited from group dimension.

**Group dimensions**: `approval_status`, `billing_type`, `budget`, `company`, `custom_fields`, `date`, `deal_status`, `financial_item`, `financial_item_type`, `future`, `organization`, `origin_deal`, `person`, `project`, `project_type`, `responsible`, `section`, `service`, `service_type`, `stage_status`, `stage_type`, `subsidiary`

**Sort fields** (sample): `approval_status`, `average_blended_rate`, `average_margin`, `average_recognized_margin`, `billing_type`, `count`, `total_cost`, `total_time`, `total_credited`, `total_invoiced`, `total_revenue`, `total_profit`, `total_scheduled_cost`, `total_scheduled_time`, `total_scheduled_revenue`, `total_recognized_revenue`, `financial_item_date`, `financial_item_type`, `financial_item_description`

**Response attributes** (key metrics): `total_cost`, `total_time`, `total_credited`, `total_invoiced`, `total_draft_invoiced`, `total_budget_used`, `total_budget_total`, `total_worked_time`, `total_billable_time`, `total_budgeted_time`, `total_estimated_cost`, `total_estimated_time`, `total_expense_cost`, `total_overhead_cost`, `total_time_entry_cost`, `total_scheduled_cost`, `total_scheduled_time`, `total_scheduled_revenue`, `total_projected_revenue`, `total_recognized_profit`, `total_recognized_revenue`, `average_margin`, `average_blended_rate`, `average_recognized_margin`, `approval_status`, `billing_type_id`, `financial_item_type`, `financial_item_date`, `financial_item_description`, `financial_item_id`, `future`, `stage_type`, `stage_status` (plus currency variants)

**Billable**: via `billing_type` filter (enum) and `billing_type` group dimension.

**Proposed MCP tool**: `get_financial_item_report`
- description: "Retrieve aggregated financial item data from Productive — time, cost, revenue, and invoicing metrics across time entries, expenses, and line items grouped by configurable dimensions."
- key params: `group` (enum), `project_id`, `budget_id`, `service_id`, `person_id`, `billing_type`, `stage_type`, `approval_status`, `future`, `sort`, `page`
- output: `{ rows: [{ group, financial_item_type, total_cost, total_time, total_revenue, total_invoiced, average_margin, … }], total_count }`

---

### 3.9 `invoice_reports`

**Path**: `GET /api/v2/reports/invoice_reports`
**operationId**: `reports-invoice_reports-index`
**Description**: Aggregated invoice data — amounts, payment status, aging, and invoicing metrics grouped by configurable dimensions.

**Filter fields**: `responsible_id`, `invoice_status`, `parent_company_id`, `id`, `export_status`, `query`, `amount_with_tax`, `invoicing_method`, `sent_on`, `jump_query`, `number`, `amount`, `credited`, `last_activity_at`, `purchase_order_number`, `delivery_on`, `custom_fields`, `tax_rates`, `sent_status`, `overdue_status`, `created_at`, `formulas`, `deal_id`, `parent_invoice_id`, `subsidiary_id`

**Date fields**: `sent_on`, `delivery_on`, `created_at`, `last_activity_at`

**Group dimensions**: `company`, `created_at`, `creator`, `currency`, `custom_fields`, `delivery_on`, `einvoice_status`, `fiscalization_status`, `invoice`, `invoice_aging`, `invoice_state`, `invoice_status`, `invoice_type`, `invoiced_on`, `issuer`, `last_activity_at`, `month`, `organization`, `overdue_status`, `paid_on`, `pay_on`, `payment_status`, `quarter`, `sent_on`, `sent_status`, `subsidiary`, `week`, `year`

**Sort fields** (sample): `company`, `count`, `total_amount`, `total_amount_with_tax`, `total_amount_paid`, `total_amount_unpaid`, `total_amount_credited`, `total_amount_written_off`, `total_amount_tax`, `average_due_in`, `average_paid_in`, `invoice_status`, `overdue_status`, `payment_status`, `sent_status`

**Response attributes** (key metrics): `total_amount`, `total_amount_with_tax`, `total_amount_tax`, `total_amount_paid`, `total_amount_unpaid`, `total_amount_credited`, `total_amount_credited_with_tax`, `total_amount_written_off`, `average_due_in`, `average_paid_in`, `count`, `invoice_status`, `invoice_type`, `invoice_aging`, `invoice_state`, `overdue_status`, `payment_status`, `sent_status`, `automatically_created`, `invoicing_method`, `einvoice_status`, `fiscalization_status`, `week`, `month`, `quarter`, `year`, `sent_on_period`, `delivery_on_period`, `paid_on_period`, `created_at_period` (plus currency variants)

**Billable**: Not applicable directly (invoicing domain).

**Proposed MCP tool**: `get_invoice_report`
- description: "Retrieve aggregated invoice analytics from Productive — amounts, payment status, aging, and overdue metrics grouped by company, status, period, or subsidiary."
- key params: `group` (enum), `invoice_status`, `overdue_status`, `sent_status`, `invoicing_method`, `credited`, `subsidiary_id`, `deal_id`, `sent_on`, `delivery_on`, `created_at`, `sort`, `page`
- output: `{ rows: [{ group, total_amount, total_amount_paid, total_amount_unpaid, average_due_in, average_paid_in, invoice_status, … }], total_count }`

---

### 3.10 `line_item_reports`

**Path**: `GET /api/v2/reports/line_item_reports`
**operationId**: `reports-line_item_reports-index`
**Description**: Aggregated invoice line item data — quantities, unit prices, totals, and tax grouped by configurable dimensions.

**Filter fields**: `invoice_id`, `creator_id`, `updater_id`, `tax_name`, `tax_value`, `id`, `service_type_id`, `unit_id`, `service_id`, `company_id`, `discount`, `tax_rate`, `expense_id`, `id` (note: `id` appears twice — spec defect)

**Date fields**: None explicit.

**Group dimensions**: `company`, `creator`, `expense`, `invoice`, `kpd_code`, `line_item`, `organization`, `service`, `service_type`, `unit`, `updater`

**Sort fields**: `budget`, `company`, `count`, `creator`, `expense`, `invoice`, `kpd_code`, `service`, `tax_rate`, `total_amount`, `total_amount_tax`, `total_amount_with_tax`, `unit_id`, `unit_price`, `updater`

**Response attributes**: `count`, `group`, `discount`, `quantity`, `tax_rate`, `unit_id`, `unit_price`, `total_amount`, `total_amount_tax`, `total_amount_with_tax`, `currency` (plus currency variants)

**Billable**: Not applicable (line items are already invoiced).

**Proposed MCP tool**: `get_line_item_report`
- description: "Retrieve aggregated invoice line item data from Productive — totals, tax, and unit prices grouped by invoice, company, service, or creator."
- key params: `group` (enum), `invoice_id`, `company_id`, `service_id`, `service_type_id`, `expense_id`, `tax_rate`, `sort`, `page`
- output: `{ rows: [{ group, count, total_amount, total_amount_with_tax, total_amount_tax, unit_price, discount, … }], total_count }`

---

### 3.11 `page_reports`

**Path**: `GET /api/v2/reports/page_reports`
**operationId**: `reports-page_reports-index`
**Description**: Aggregated wiki/documentation page data grouped by project, creator, or updater.

**Filter fields**: `jump_query`, `project_id`, `query`, `id`, `edited_at`, `fuzzy_dates`, `root_page_id`, `fuzzy_people`, `creator_id`, `subscriber_id`, `created_at`, `person_type`, `parent_page_id`, `template`, `custom_fields`, `project_status`, `status`, `full_query`, `last_activity_at`, `id` (duplicate `id` — spec defect)

**Date fields**: `edited_at`, `fuzzy_dates`, `created_at`, `last_activity_at`

**Group dimensions**: `creator`, `custom_fields`, `organization`, `page`, `project`, `updater`

**Sort fields**: `count`, `created_at`, `creator`, `custom_fields`, `edited_at`, `page`, `page_id`, `page_last_activity_at`, `project`, `title`, `updater`

**Response attributes**: `count`, `group`, `title`, `currency`, `edited_at`, `created_at`, `custom_fields`, `last_activity_at`, `formula_fields` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_page_report`
- description: "Retrieve aggregated page/documentation data from Productive — counts and activity metrics grouped by project, creator, or updater."
- key params: `group` (enum), `project_id`, `creator_id`, `root_page_id`, `parent_page_id`, `status`, `template`, `created_at`, `edited_at`, `sort`, `page`
- output: `{ rows: [{ group, count, title, created_at, edited_at, last_activity_at, … }], total_count }`

---

### 3.12 `payment_reports`

**Path**: `GET /api/v2/reports/payment_reports`
**operationId**: `reports-payment_reports-index`
**Description**: Aggregated payment data — amounts received, written off, and timing grouped by configurable dimensions.

**Filter fields**: `query`, `budget_id`, `formulas`, `invoice_id`, `written_off_on`, `amount`, `paid_before`, `number`, `project_id`, `external_id`, `paid_after`, `paid_on`, `company_id`, `id`, `subsidiary_id`, `id` (duplicate — spec defect)

**Date fields**: `paid_on`, `paid_before`, `paid_after`, `written_off_on`

**Group dimensions**: `company`, `date`, `invoice`, `month`, `organization`, `payment`, `quarter`, `subsidiary`, `week`, `year`

**Sort fields**: `company`, `count`, `date`, `deal`, `invoice`, `month`, `payment`, `payment_date`, `payment_external_id`, `payment_note`, `payment_paid_on`, `payment_written_off_on`, `project`, `quarter`, `subsidiary`, `total_amount`, `week`, `year`

**Response attributes**: `count`, `group`, `total_amount`, `currency`, `week`, `month`, `quarter`, `year`, `date_period` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_payment_report`
- description: "Retrieve aggregated payment data from Productive — total amounts received grouped by invoice, company, subsidiary, or time period."
- key params: `group` (enum), `invoice_id`, `project_id`, `company_id`, `subsidiary_id`, `budget_id`, `paid_on`, `paid_after`, `paid_before`, `sort`, `page`
- output: `{ rows: [{ group, count, total_amount, currency, date_period, … }], total_count }`

---

### 3.13 `payroll_item_reports`

**Path**: `GET /api/v2/reports/payroll_item_reports`
**operationId**: `reports-payroll_item_reports-index`
**Description**: Aggregated payroll item data — costs, time, capacity, and time off grouped by person, role, or salary type.

**Filter fields**: `subsidiary_id`, `salary_type_id`, `company_id`, `date`, `role_id`, `payroll_item_type`, `parent_company_id`, `booking_id`, `custom_fields`, `formulas`, `group`, `salary_id`, `person_status`, `person_id`, `time_entry_id`, `person_type`, `id`

**Date fields**: `date`

**Group dimensions**: `booking`, `company`, `custom_fields`, `date`, `organization`, `payroll_item`, `payroll_item_type`, `person`, `person_status`, `person_type`, `role`, `salary`, `salary_type`, `subsidiary`, `time_entry`

**Sort fields** (sample): `company_id`, `count`, `custom_fields`, `date`, `end_date`, `payroll_item_id`, `payroll_item_type`, `person`, `person_status`, `person_type`, `role_id`, `salary_id`, `salary_type_id`, `start_date`, `subsidiary_id`, `total_cost`, `total_time`

**Response attributes**: `count`, `group`, `role_id`, `salary_type_id`, `person_type`, `person_status`, `payroll_item_type`, `payroll_item_id`, `total_cost`, `total_time`, `total_capacity`, `total_availability`, `total_scheduled_time`, `total_time_off_cost`, `total_time_off_time`, `currency`, `start_date`, `end_date` (plus currency variants)

**Billable**: Not applicable (payroll domain).

**Proposed MCP tool**: `get_payroll_item_report`
- description: "Retrieve aggregated payroll item data from Productive — costs, time, capacity, and time off grouped by person, role, salary type, or date."
- key params: `group` (enum), `person_id`, `role_id`, `salary_id`, `salary_type_id`, `payroll_item_type`, `date`, `subsidiary_id`, `sort`, `page`
- output: `{ rows: [{ group, payroll_item_type, total_cost, total_time, total_capacity, total_availability, total_time_off_cost, … }], total_count }`

---

### 3.14 `person_reports`

**Path**: `GET /api/v2/reports/person_reports`
**operationId**: `reports-person_reports-index`
**Description**: Aggregated person/HR data — counts, contact info, and activity metrics grouped by configurable dimensions.

**Filter fields**: `two_factor_auth`, `email`, `last_seen_at`, `subscribable_id`, `permissions`, `approval_policy_id`, `subsidiary_id`, `id`, `accessible_project_id`, `offboarding_status`, `role_id`, `virtual`, `status`, `schedulable`, `holiday_calendar_id`, `project_watching`, `team`, `autotracking`, `deactivated_at`, `accessible_filter_id`, `jump_query`, `last_activity_at`, `agent`, `bookings_after`, `full_query`

**Date fields**: `last_seen_at`, `deactivated_at`, `last_activity_at`, `bookings_after`

**Group dimensions**: `approval_policy`, `autotracking`, `company`, `contact_address`, `contact_city`, `contact_country`, `contact_email`, `contact_phone`, `contact_state`, `contact_website`, `contact_zipcode`, `created_at`, `custom_fields`, `custom_role`, `deactivated_at`, `joined_at`, `last_activity_at`, `manager`, `month`, `offboarding_status`, `organization`, `person`, `quarter`, `role_id`, `status`, `subsidiary`, `type`, `week`, `year`

**Sort fields** (sample): `approval_policy`, `autotracking`, `company`, `count`, `status`, `person`, `role_id`, `type`, `deactivated_at`, `joined_at`, `last_activity_at`

**Response attributes**: `count`, `group`, `type`, `status`, `role_id`, `autotracking`, `currency`, `contact_address`, `contact_city`, `contact_country`, `contact_email`, `contact_phone`, `contact_state`, `contact_website`, `contact_zipcode`, `custom_fields`, `week`, `month`, `quarter`, `year`, `offboarding_status`, `joined_at_period`, `deactivated_at_period`, `created_at_period`, `last_activity_at_period` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_person_report`
- description: "Retrieve aggregated person/team data from Productive — headcount, contact details, and activity metrics grouped by role, status, subsidiary, or time period."
- key params: `group` (enum), `role_id`, `status`, `subsidiary_id`, `team`, `offboarding_status`, `autotracking`, `virtual`, `sort`, `page`
- output: `{ rows: [{ group, count, type, status, role_id, contact_country, … }], total_count }`

---

### 3.15 `price_reports`

**Path**: `GET /api/v2/reports/price_reports`
**operationId**: `reports-price_reports-index`
**Description**: Aggregated pricing/rate card data — average rates, discounts, markups, and estimated costs grouped by service type, rate card, or company.

**Filter fields**: `rate_card_id`, `rate_card_status`, `company_id`, `booking_tracking_enabled`, `custom_fields`, `id`, `unit_id`, `service_type_id`, `time_tracking_enabled`, `billing_type_id`, `expense_tracking_enabled`, `id` (duplicate — spec defect)

**Date fields**: None.

**Group dimensions**: `booking_tracking_enabled`, `company`, `currency`, `expense_tracking_enabled`, `organization`, `price`, `rate_card`, `rate_card_status`, `service_type`, `time_tracking_enabled`

**Sort fields**: `average_discount`, `average_discount_amount`, `average_discounted_rate`, `average_estimated_cost`, `average_markup`, `average_markup_amount`, `average_rate`, `booking_tracking_enabled`, `company`, `count`, `expense_tracking_enabled`, `price`, `price_description`, `price_name`, `price_quantity`, `rate_card`, `rate_card_status`, `service_type`, `time_tracking_enabled`, `unit_id`

**Response attributes**: `count`, `group`, `average_rate`, `average_markup`, `average_markup_amount`, `average_discount`, `average_discount_amount`, `average_discounted_rate`, `average_estimated_cost`, `rate_card_status`, `time_tracking_enabled`, `booking_tracking_enabled`, `expense_tracking_enabled`, `currency` (plus currency variants)

**Billable**: `billing_type_id` filter (ID reference). Relevant for pricing configuration.

**Proposed MCP tool**: `get_price_report`
- description: "Retrieve aggregated pricing and rate card data from Productive — average rates, discounts, and markups grouped by service type, rate card, or company."
- key params: `group` (enum), `company_id`, `rate_card_id`, `rate_card_status`, `service_type_id`, `billing_type_id`, `time_tracking_enabled`, `sort`, `page`
- output: `{ rows: [{ group, count, average_rate, average_markup, average_discount, average_estimated_cost, … }], total_count }`

---

### 3.16 `project_reports`

**Path**: `GET /api/v2/reports/project_reports`
**operationId**: `reports-project_reports-index`
**Description**: Aggregated project performance data — revenues, costs, profit margins, and pipeline values grouped by configurable dimensions.

**Filter fields**: `responsible_id`, `jump_query`, `query`, `profit_margin`, `name`, `created_at`, `company_id`, `id`, `profit`, `projected_revenue`, `person_id`, `number`, `fuzzy_dates`, `revenue`, `pending_invoicing`, `estimated_time`, `project_color`, `cost`, `custom_fields`, `template`, `public_access`, `project_id`, `project_type`, `total_worked_time`, `budget_id`

**Date fields**: `created_at`, `fuzzy_dates`

**Group dimensions**: `company`, `created_at`, `custom_fields`, `last_activity_at`, `month`, `organization`, `project`, `project_manager`, `project_status`, `project_type`, `quarter`, `week`, `year`

**Sort fields** (sample): `company`, `count`, `project`, `project_type`, `project_status`, `project_manager`, `total_revenue`, `total_cost`, `total_profit`, `average_profit_margin`, `total_projected_revenue`, `total_needs_invoicing`, `total_pending_invoicing`, `total_worked_time`, `total_estimated_time`

**Response attributes** (key metrics): `total_revenue`, `total_cost`, `total_profit`, `total_projected_revenue`, `total_needs_invoicing`, `total_pending_invoicing`, `total_worked_time`, `total_estimated_time`, `average_profit_margin`, `project_type`, `project_status`, `count`, `currency`, `week`, `month`, `quarter`, `year`, `created_at_period`, `last_activity_at_period` (plus currency variants)

**Billable**: Not a direct filter. `total_worked_time` and related time fields in response.

**Proposed MCP tool**: `get_project_report`
- description: "Retrieve aggregated project performance data from Productive — revenues, costs, profit, and pipeline metrics grouped by project, company, type, status, or time period."
- key params: `group` (enum), `company_id`, `project_id`, `budget_id`, `responsible_id`, `person_id`, `project_type`, `sort`, `page`
- output: `{ rows: [{ group, project_type, project_status, total_revenue, total_cost, total_profit, average_profit_margin, total_projected_revenue, … }], total_count }`

---

### 3.17 `proposal_reports`

**Path**: `GET /api/v2/reports/proposal_reports`
**operationId**: `reports-proposal_reports-index`
**Description**: Paginated proposal analytics — signed status, tax amounts, and budget totals grouped by deal, company, or status.

**Filter fields**: `status_changed_at`, `company_id`, `creator_id`, `status`, `tax_amount`, `date_signed`, `sent_at`, `responsible_id`, `id`, `budget_total`, `created_at`, `deal_id`, `updated_at`, `formulas`, `link_status`, `id` (duplicate — spec defect)

**Date fields**: `status_changed_at`, `date_signed`, `sent_at`, `created_at`, `updated_at`

**Group dimensions**: `company`, `created_at`, `creator`, `currency`, `date_signed`, `deal`, `link_status`, `organization`, `proposal`, `responsible`, `sent_at`, `signed`, `status`, `status_changed_at`, `subsidiary`, `updated_at`

**Sort fields**: `average_tax_rate_value`, `company`, `count`, `created_at`, `creator`, `date_signed`, `deal`, `link_status`, `name`, `responsible`, `sent_at`, `signed`, `signed_by_email`, `status`, `status_changed_at`, `total_budget_total`, `total_tax_amount`, `updated_at`

**Response attributes**: `count`, `group`, `signed`, `status`, `link_status`, `signed_by_email`, `total_budget_total`, `total_tax_amount`, `average_tax_rate_value`, `currency`, `sent_at_period`, `date_signed_period`, `created_at_period`, `updated_at_period`, `status_changed_at_period` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_proposal_report`
- description: "Retrieve aggregated proposal analytics from Productive — signed counts, budget totals, and status distributions grouped by deal, company, status, or responsible person."
- key params: `group` (enum), `company_id`, `deal_id`, `creator_id`, `responsible_id`, `status`, `link_status`, `date_signed`, `sent_at`, `sort`, `page`
- output: `{ rows: [{ group, count, signed, status, link_status, total_budget_total, total_tax_amount, … }], total_count }`

---

### 3.18 `salary_reports`

**Path**: `GET /api/v2/reports/salary_reports`
**operationId**: `reports-salary_reports-index`
**Response ref**: `collection_new_salary_report`
**Description**: Aggregated salary cost data — hourly, weekly, monthly, annual costs, capacity, and overhead grouped by person or salary type.

**Filter fields**: `hourly_cost`, `salary_id`, `date`, `started_on`, `estimated_weekly_hours`, `holiday_calendar_id`, `time`, `bi_weekly_cost`, `weekly_cost`, `person_id`, `people_custom_fields`, `id`, `overhead`, `ended_on`, `formulas`, `salary_type_id`, `monthly_cost`, `annuall_cost` (note: spec typo — `annuall_cost` not `annual_cost`), `id` (duplicate — spec defect)

**Date fields**: `date`, `started_on`, `ended_on`

**Group dimensions**: `date`, `organization`, `overhead`, `people_custom_fields`, `person`, `salary`, `salary_type_id`

**Sort fields** (sample): `count`, `date`, `engagement_ended_on`, `engagement_started_on`, `estimated_weekly_hours`, `overhead`, `people_custom_fields`, `person`, `salary_id`, `salary_type_id`, `time`, `total_annually_cost`, `total_bi_weekly_cost`, `total_hourly_cost`, `total_monthly_cost`, `total_period_cost`, `total_weekly_cost`

**Response attributes**: `time`, `count`, `group`, `capacity`, `overhead`, `work_days`, `salary_type_id`, `total_hourly_cost`, `total_period_cost`, `total_weekly_cost`, `total_monthly_cost`, `total_annually_cost`, `total_bi_weekly_cost`, `total_estimated_weekly_hours`, `total_overhead_cost_per_hour`, `currency`, `date_period`, `start_date_period`, `end_date_period`, `people_custom_fields` (plus currency variants)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_salary_report`
- description: "Retrieve aggregated salary cost data from Productive — hourly, weekly, monthly, and annual costs with overhead grouped by person or salary type."
- key params: `group` (enum), `person_id`, `salary_id`, `salary_type_id`, `overhead`, `date`, `started_on`, `ended_on`, `sort`, `page`
- output: `{ rows: [{ group, salary_type_id, total_hourly_cost, total_weekly_cost, total_monthly_cost, total_annually_cost, capacity, overhead, … }], total_count }`

---

### 3.19 `service_reports`

**Path**: `GET /api/v2/reports/service_reports`
**operationId**: `reports-service_reports-index`
**Description**: Aggregated service (budget line) data — worked time, costs, revenues, estimates, and forecasts grouped by configurable dimensions.

**Filter fields**: `stage_type`, `budget_remaining`, `explicit_access`, `section_id`, `limitation_type`, `deal_stage_id`, `id`, `template`, `stage_status_id`, `for_tracking`, `remaining_scheduled_time`, `deal_custom_fields`, `estimated_cost`, `profit`, `service_type_id`, `after`, `time_tracking_enabled`, `left_to_schedule_time`, `bookable_after`, `responsible_id`, `query`, `bookable_date`, `billable`, `rolled_over_time`, `markup`

**Date fields**: `after`, `bookable_after`, `bookable_date`

**Group dimensions**: `billable`, `billing_type`, `booking_tracking_enabled`, `budget`, `budget_cap_enabled`, `budget_custom_fields`, `budget_status`, `company`, `custom_fields`, `date`, `deal_custom_fields`, `deal_status`, `expense_tracking_enabled`, `limitation_type`, `organization`, `origin_deal`, `pipeline`, `project`, `project_type`, `recurring`, `responsible`, `sales_status`, `section`, `section_name`, `service`, `service_type`, `stage_status`, `stage_type`, `subsidiary`, `time_tracking_enabled`, `unit`

**Sort fields** (sample): `average_actual_rate`, `average_budget_usage`, `average_discount`, `average_forecasted_budget_usage`, `average_profit_margin`, `billable`, `billing_type`, `budget`, `company`, `count`, `total_cost`, `total_price`, `total_profit`, `total_revenue`, `total_worked_time`, `total_billable_time`, `total_estimated_time`, `total_estimated_cost`, `total_forecasted_budget_used`, `total_unapproved_time`

**Response attributes** (key metrics): `billable`, `billing_type`, `unit`, `recurring`, `stage_type`, `limitation_type`, `budget_status`, `total_cost`, `total_price`, `total_profit`, `total_revenue`, `total_booked_time`, `total_worked_time`, `total_billable_time`, `total_budgeted_time`, `total_estimated_cost`, `total_estimated_time`, `total_expense_cost`, `total_unapproved_time`, `total_budget_used`, `total_budget_total`, `total_budget_remaining`, `total_projected_revenue`, `total_recognized_revenue`, `total_rolled_over_time`, `total_future_booked_time`, `total_left_to_schedule_time`, `total_remaining_scheduled_time`, `average_actual_rate`, `average_markup`, `average_discount`, `average_budget_usage`, `average_profit_margin`, `average_forecasted_budget_usage`, `time_tracking_enabled`, `booking_tracking_enabled`, `expense_tracking_enabled`, `budget_cap_enabled` (plus currency variants)

**Billable**: `filter[billable]=true/false` (direct boolean filter) and `billable` group dimension.

**Proposed MCP tool**: `get_service_report`
- description: "Retrieve aggregated service/budget-line data from Productive — worked time, costs, revenues, estimates, and forecasted metrics grouped by service type, project, stage, or billing type."
- key params: `group` (enum), `billable`, `service_type_id`, `stage_type`, `stage_status_id`, `limitation_type`, `responsible_id`, `after`, `sort`, `page`
- output: `{ rows: [{ group, billable, billing_type, total_cost, total_revenue, total_worked_time, total_billable_time, average_profit_margin, average_budget_usage, … }], total_count }`

---

### 3.20 `survey_reports`

**Path**: `GET /api/v2/reports/survey_reports`
**operationId**: `reports-survey_reports-index`
**Description**: Aggregated survey data — counts grouped by project, creator, or updater. Sparse response; primarily useful for survey inventory/count queries.

**Filter fields**: `created_at`, `title`, `query`, `id`, `project_id`, `editable`, `creator_id`, `id` (duplicate — spec defect)

**Date fields**: `created_at`

**Group dimensions**: `creator`, `organization`, `project`, `survey`, `updater`

**Sort fields**: `count`, `created_at`, `creator`, `project`, `survey`, `survey_id`, `title`, `updater`

**Response attributes**: `count`, `group`, `title`, `currency`, `created_at` (plus currency variants — though no monetary metrics are evident)

**Billable**: Not applicable.

**Proposed MCP tool**: `get_survey_report`
- description: "Retrieve aggregated survey data from Productive — counts grouped by project, creator, or updater."
- key params: `group` (enum), `project_id`, `creator_id`, `editable`, `created_at`, `sort`, `page`
- output: `{ rows: [{ group, count, title, created_at, … }], total_count }`

---

### 3.21 `task_reports`

**Path**: `GET /api/v2/reports/task_reports`
**operationId**: `reports-task_reports-index`
**Description**: Aggregated task data — counts, worked time, estimates, and completion metrics grouped by configurable dimensions.

**Filter fields**: `updated_at`, `service_id`, `public_access`, `task_list_id`, `workflow_id`, `person_type`, `folder_name`, `date_range`, `folder_id`, `bookable_before`, `closed_after`, `parent_task_id`, `query`, `overdue_status`, `workflow_status_category_id`, `before`, `tags`, `due_date_before`, `start_date_before`, `closed_before`, `type_id`, `subtask`, `project_manager_id`

**Date fields**: `date_range`, `due_date_before`, `start_date_before`, `bookable_before`, `closed_after`, `closed_before`, `before`, `updated_at`

**Group dimensions**: `assignee`, `board`, `closed_at`, `company`, `created_at`, `creator`, `custom_fields`, `due_date`, `folder`, `last_activity_at`, `last_actor`, `month`, `organization`, `parent_task`, `project`, `quarter`, `repeating`, `service`, `start_date`, `status`, `task`, `task_list`, `week`, `workflow`, `workflow_status`, `workflow_status_category_id`, `year`

**Sort fields** (sample): `assignee`, `board`, `closed_at`, `company`, `count`, `created_at`, `creator`, `custom_fields`, `due_date`, `folder`, `last_activity_at`, `placement`, `status`, `task`, `task_list`, `total_billable_time`, `total_initial_estimate`, `total_worked_time`, `workflow_status`, `workflow_status_category_id`

**Response attributes**: `count`, `group`, `repeating`, `status`, `week`, `month`, `quarter`, `year`, `custom_fields`, `workflow_status_category_id`, `total_worked_time`, `total_billable_time`, `total_remaining_time`, `total_initial_estimate`, `total_estimate_at_completion`, `total_estimation_offset_time`, `currency`, `due_date_period`, `closed_at_period`, `created_at_period`, `start_date_period`, `last_activity_at_period` (plus currency variants)

**Billable**: `total_billable_time` in response attributes; no direct billable filter field in spec.

**Proposed MCP tool**: `get_task_report`
- description: "Retrieve aggregated task analytics from Productive — counts, worked time, estimates, and completion metrics grouped by assignee, project, status, workflow, or time period."
- key params: `group` (enum), `service_id`, `workflow_id`, `workflow_status_category_id`, `task_list_id`, `overdue_status`, `closed_after`, `closed_before`, `due_date_before`, `date_range`, `sort`, `page`
- output: `{ rows: [{ group, count, status, total_worked_time, total_billable_time, total_initial_estimate, total_remaining_time, … }], total_count }`

---

### 3.22 `time_entry_reports`

**Path**: `GET /api/v2/reports/time_entry_reports`
**operationId**: `reports-time_entry_reports-index`
**Description**: Aggregated time entry data — billable vs non-billable time, costs, blended rates, overhead, and invoicing status grouped by configurable dimensions.

**Filter fields**: `jira_issue_summary`, `approval_policy_id`, `person_tags`, `started_after`, `person_subsidiary_id`, `unit_id`, `started_at`, `approved_at`, `designated_approver_id`, `parent_company_id`, `status`, `people_custom_fields`, `cost`, `after`, `ended_at`, `role_id`, `invoice_id`, `approver_id`, `awaiting_approval_from_approver_id`, `billable`, `deal_id`, `invoicing_status`, `date`, `budget_id`, `responsible_id`

**Date fields**: `date`, `after`, `started_after`, `started_at`, `ended_at`, `approved_at`

**Group dimensions**: `approval_policy`, `approver`, `autotracked`, `billing_type`, `budget`, `company`, `created_at`, `creator`, `custom_fields`, `date`, `day`, `deal_subsidiary`, `designated_approver`, `ended_at`, `intercompany_hours`, `invoice`, `invoiced`, `invoicing_status`, `jira_issue_id`, `jira_issue_status`, `jira_issue_summary`, `last_activity_at`, `last_actor`, `month`, `organization`, `overhead`, `people_custom_fields`, `person`, `person_subsidiary`, `project`, `project_type_id`, `quarter`, `responsible`, `section_name`, `service`, `service_type`, `stage_type`, `started_at`, `status`, `task`, `task_list`, `time_entry`, `track_method_id`, `unit_id`, `week`, `year`

**Sort fields** (sample): `approval_policy`, `approver`, `autotracked`, `average_blended_rate`, `average_recognized_margin`, `billing_type`, `budget`, `company`, `count`, `total_cost`, `total_time`, `total_billable_time`, `total_work_cost`, `total_overhead_cost`, `total_recognized_revenue`, `total_recognized_profit`, `total_billable_revenue`, `total_facility_overhead_cost`, `total_internal_overhead_cost`, `status`, `invoicing_status`

**Response attributes** (key metrics): `total_time`, `total_cost`, `total_work_cost`, `total_overhead_cost`, `total_facility_overhead_cost`, `total_internal_overhead_cost`, `total_billable_time`, `total_billable_revenue`, `total_recognized_time`, `total_recognized_profit`, `total_recognized_revenue`, `average_blended_rate`, `average_recognized_margin`, `count`, `invoiced`, `invoicing_status`, `status`, `overhead`, `autotracked`, `billing_type`, `stage_type`, `intercompany_hours`, `jira_issue_id`, `jira_issue_status`, `jira_issue_summary`, `unit_id`, `track_method_id`, `day`, `week`, `month`, `quarter`, `year`, `started_at`, `ended_at`, `date_period` (plus currency variants)

**Billable**: `filter[billable]=true/false` (direct boolean filter) and `billing_type` group dimension.

**Proposed MCP tool**: `get_time_entry_report`
- description: "Retrieve aggregated time entry analytics from Productive — billable time, costs, blended rates, overhead, and invoicing status grouped by person, project, service, billing type, or time period."
- key params: `group` (enum), `billable`, `date`, `after`, `started_after`, `approved_at`, `budget_id`, `invoice_id`, `status`, `invoicing_status`, `billing_type`, `overhead`, `sort`, `page`
- output: `{ rows: [{ group, total_time, total_billable_time, total_cost, average_blended_rate, total_recognized_revenue, invoicing_status, … }], total_count }`

---

### 3.23 `time_reports`

**Path**: `GET /api/v2/reports/time_reports`
**operationId**: `reports-time_reports-index`
**Response ref**: `collection_new_time_report`
**Description**: Aggregated capacity-aware time report — combines worked time, bookings, scheduled time, capacity, and availability. The most comprehensive time overview report.

**Filter fields**: `before`, `people_custom_fields`, `week`, `budget_tags`, `service_type_id`, `month`, `role_id`, `person_tags`, `bookings_before`, `formulas`, `project_id`, `after`, `bookings_custom_fields`, `day`, `subsidiary_id`, `bookings_after`, `event_id`, `year`, `stage_type`, `person_type`, `project_type`, `role_type`, `service_id`, `quarter`, `billing_type`

**Date fields**: `after`, `before`, `day`, `week`, `month`, `quarter`, `year`, `bookings_before`, `bookings_after`

**Group dimensions**: `billing_type`, `budget`, `company`, `date`, `day`, `event`, `future`, `manager`, `month`, `organization`, `people_custom_fields`, `person`, `project`, `quarter`, `service`, `service_type`, `stage_type`, `subsidiary`, `week`, `year`

**Sort fields** (sample): `available_time`, `average_cost_rate`, `billable_time`, `billing_type`, `budget`, `capacity`, `client_time`, `company`, `count`, `date`, `draft_scheduled_billable_time`, `draft_scheduled_client_time`, `draft_scheduled_internal_time`, `holiday_time`, `internal_time`, `recognized_time`, `scheduled_time`, `total_cost`, `total_scheduled_cost`, `total_scheduled_revenue`, `unapproved_time`, `workload`

**Response attributes** (key metrics): `worked_time`, `billable_time`, `client_time`, `internal_time`, `holiday_time`, `event_time`, `paid_event_time`, `unpaid_event_time`, `scheduled_event_time`, `unapproved_time`, `recognized_time`, `scheduled_time`, `scheduled_billable_time`, `scheduled_client_time`, `scheduled_internal_time`, `draft_scheduled_time`, `draft_scheduled_billable_time`, `draft_scheduled_client_time`, `draft_scheduled_internal_time`, `recognized_scheduled_time`, `scheduled_remote_work_time`, `capacity`, `user_capacity`, `available_time`, `workload`, `total_cost`, `total_work_cost`, `total_scheduled_cost`, `total_scheduled_revenue`, `total_draft_scheduled_cost`, `total_draft_scheduled_revenue`, `average_cost_rate`, `future`, `billing_type`, `stage_type`, `day`, `week`, `month`, `quarter`, `year`, `date_period` (plus currency variants)

**Billable**: `filter[billing_type]=…` (enum field for billable/non-billable/internal distinction) and `billing_type` group dimension. Most granular billable breakdown of any report.

**Proposed MCP tool**: `get_time_report`
- description: "Retrieve aggregated time overview from Productive combining worked time, capacity, scheduled bookings, and availability — grouped by person, project, billing type, date, or manager."
- key params: `group` (enum), `after`, `before`, `day`, `week`, `month`, `quarter`, `year`, `billing_type`, `project_id`, `service_id`, `role_id`, `subsidiary_id`, `bookings_after`, `bookings_before`, `sort`, `page`
- output: `{ rows: [{ group, worked_time, billable_time, capacity, available_time, unapproved_time, scheduled_time, total_cost, … }], total_count }`

---

### 3.24 `timesheet_reports`

**Path**: `GET /api/v2/reports/timesheet_reports`
**operationId**: `reports-timesheet_reports-index`
**Description**: Aggregated timesheet data — day-by-day time, capacity, and availability per week, grouped by person or organisation.

**Filter fields**: `person_id`, `week_submission_status`, `query`, `people_custom_fields`, `after`, `tags`, `before`, `person_status`, `id`

**Date fields**: `after`, `before`

**Group dimensions**: `organization`, `person`, `week`

**Sort fields**: `count`, `friday_capacity`, `friday_time`, `monday_capacity`, `monday_time`, `person`, `saturday_capacity`, `saturday_time`, `sunday_capacity`, `sunday_time`, `thursday_capacity`, `thursday_time`, `tuesday_capacity`, `tuesday_time`, `wednesday_capacity`, `wednesday_time`, `week`, `week_submission_status`

**Response attributes**: `count`, `group`, `week`, `week_submission_status`, `currency`, `monday_time`, `tuesday_time`, `wednesday_time`, `thursday_time`, `friday_time`, `saturday_time`, `sunday_time`, `monday_capacity`, `tuesday_capacity`, `wednesday_capacity`, `thursday_capacity`, `friday_capacity`, `saturday_capacity`, `sunday_capacity`, `monday_available`, `tuesday_available`, `wednesday_available`, `thursday_available`, `friday_available`, `saturday_available`, `sunday_available` (plus currency variants)

**Billable**: Not applicable (timesheet approval domain).

**Proposed MCP tool**: `get_timesheet_report`
- description: "Retrieve aggregated timesheet data from Productive — day-by-day time, capacity, and availability per person per week grouped by person or week."
- key params: `group` (enum), `person_id`, `after`, `before`, `week_submission_status`, `person_status`, `sort`, `page`
- output: `{ rows: [{ group, week, week_submission_status, monday_time, … sunday_time, monday_capacity, … sunday_capacity, monday_available, … sunday_available }], total_count }`

---

## 4. Recommended Tool Grouping

### 4.1 Standalone tools (distinct domains, unique metrics)

These reports have sufficiently different parameter shapes, response schemas, and use-cases to warrant individual tools:

| Tool name | Report | Rationale |
|---|---|---|
| `get_time_report` | `time_reports` | Most complex; day/week/month/quarter/year filters, capacity, bookings integration |
| `get_time_entry_report` | `time_entry_reports` | Approval workflow, billable boolean, Jira integration, overhead breakdown |
| `get_timesheet_report` | `timesheet_reports` | Per-day-of-week schema; approval status; only 3 group dimensions |
| `get_booking_report` | `booking_reports` | Scheduling domain; absence_type, stage_type, approval_status |
| `get_budget_report` | `budget_reports` | Rich forecast/invoicing metrics; ~100 response attributes |
| `get_service_report` | `service_reports` | Budget-line level; billable filter; limitation_type; rolled_over_time |
| `get_financial_item_report` | `financial_item_reports` | Cross-domain (time+expense+line); future boolean; locked filter |
| `get_invoice_report` | `invoice_reports` | Invoicing-specific aging, payment status, fiscalization fields |
| `get_payment_report` | `payment_reports` | Simple but payment-specific date filters |
| `get_payroll_item_report` | `payroll_item_reports` | HR/payroll domain; time_off metrics |
| `get_salary_report` | `salary_reports` | Salary cost domain; engagement dates; overhead |
| `get_entitlement_report` | `entitlement_reports` | Leave/absence domain; allocated vs used |

### 4.2 Candidates for grouping with a `report_type` discriminator

These reports have similar filter shapes and response patterns and could share a single MCP tool if you prefer fewer tools:

**Group A — CRM/pipeline reports** (could share `get_crm_report` with `report_type` param):
- `company_reports` — company counts and contact info
- `deal_reports` — deal pipeline metrics
- `deal_funnel_reports` — funnel stage counts (very few filter options; consider standalone)
- `proposal_reports` — proposal status

**Group B — Project overview reports** (could share `get_project_overview_report`):
- `project_reports` — project-level aggregates
- `task_reports` — task-level aggregates under projects

**Group C — HR data reports** (could share `get_hr_report`):
- `person_reports` — headcount, contact info
- `entitlement_reports` — leave allocation (different enough to keep standalone)

**Group D — Content reports** (trivial response, could share `get_content_report`):
- `page_reports` — wiki pages
- `survey_reports` — surveys
- `line_item_reports` — invoice lines (different enough to keep standalone)

**Group E — Financial aggregates** (could share `get_financial_report`):
- `expense_reports`
- `price_reports`

**Recommendation**: Keep all 24 as standalone tools. The parameter shapes diverge enough that a `report_type` discriminator would require a very wide union schema. Standalone tools are simpler to document, easier for LLMs to select, and allow correct parameter validation per report. The total is manageable (24 tools).

---

## 5. Validation Gotchas

1. **Duplicate `id` in filter schemas**: `filter_booking_report`, `filter_company_report`, `filter_line_item_report`, `filter_page_report`, `filter_payment_report`, `filter_price_report`, `filter_proposal_report`, `filter_new_salary_report`, `filter_survey_report` all have `id` listed twice in the spec. When building Zod schemas, only declare `id` once. This is a spec defect, not a feature.

2. **`annuall_cost` typo in salary filter**: The spec has `annuall_cost` (double-l) in `filter_new_salary_report`. Match the spec exactly when constructing the API query, or the filter will be silently ignored.

3. **`deal_funnel_report` sort has no enum**: Unlike all other reports, `sort_deal_funnel_report` accepts a free-form string array with no validated enum. Validate client-side or accept any string.

4. **`group` is a single string, not an array**: All `group_*_report` parameters are typed as `type: string` (not `type: array`). Pass a single value, not an array.

5. **`filter` uses deepObject style**: The filter parameter requires `style: deepObject`. In practice this means: `filter[field][operator]=value` or `filter[field][]=value` (for arrays). Do not pass `filter={"field": ...}` as JSON — it will not be parsed.

6. **No multi-level grouping**: The spec defines a single `group` enum value per request. There is no `group_by[]` array support. To achieve multi-dimensional aggregation, make multiple requests.

7. **Currency variants**: Every monetary metric `foo` comes with `foo_default` (org currency) and `foo_normalized` (normalised). When displaying to users, prefer `foo_default` for consistent currency display unless multi-currency breakdown is needed.

8. **`financial_item_report` has no date filter**: Unlike most reports, `filter_financial_item_report` has no direct date filter field. Date context must be provided through the `future` boolean filter or inferred from group dimensions. This may be a limitation of the endpoint.

9. **`time_reports` uses `billing_type` enum, `time_entry_reports` uses `billable` boolean**: These are two different filter mechanisms for what feels like the same concept. `time_reports` filters by billing type enum (billable/non-billable/internal); `time_entry_reports` accepts `filter[billable]=true/false`. Do not conflate them.

10. **Pagination**: All endpoints use standard JSON:API pagination. Include `page[number]` and `page[size]` in requests. The `meta.total_count` field gives the total result count.

---

## 6. References

- Source file: `/Users/ruben/Developer/productive-mcp/api-master.yaml`
- Endpoint definitions: lines 9731–10109
- Filter schemas (`filter_*_report`): lines 14217–93850 (schemas section)
- Group parameters (`group_*_report`): lines 96076–101335 (components/parameters)
- Sort parameters (`sort_*_report`): lines 96241–101556 (components/parameters)
- Response schemas (`collection_*_report`): lines 105164–119906 (components/responses)
- Existing tool pattern: `/Users/ruben/Developer/productive-mcp/src/tools/activities.ts`
- MCP tool annotation pattern: `annotations: { readOnlyHint: true }` (all report tools are read-only)
- Output convention: `{ content: [{ type: 'text', text: string }] }` with `structuredContent` for machine-readable data
