# Productive.io REST API v2 — Research Notes

Source: `/Users/ruben/Developer/productive-mcp/api-master.yaml` (121 189 lines, OpenAPI 3.1, ~363 endpoints)
Reference: https://developer.productive.io

---

## 1. Summary

Productive.io exposes a REST API at `https://api.productive.io/api/v2/`. Every endpoint follows [JSON:API 1.0](https://jsonapi.org/) conventions: resources are wrapped in `data`, optional side-loaded resources appear in `included`, and pagination metadata lives in `meta`. Authentication uses two static HTTP headers. The spec covers tasks, projects, boards, task lists, companies, deals/budgets, invoices, time entries, expenses, people, custom fields, and ~25 other domains.

Key traits:
- All IDs are integers in schemas but sent/received as **strings** in JSON (e.g. `"id": "42"`).
- Money amounts are **integers representing subunits** (cents / smallest currency unit).
- Dates are ISO 8601 `date` (`YYYY-MM-DD`); timestamps are ISO 8601 `date-time` (e.g. `2026-03-15T10:30:00.000+00:00`).
- Most list resources support `filter[]`, `sort`, and `page[]` query parameters.
- Soft-delete is pervasive; a `/api/v2/deleted_items` endpoint exposes a recycle bin with restore capability.
- Many resources have `/archive`, `/restore`, `/copy`, `/move`, and `/reposition` action endpoints (always `PATCH` or `POST`).

---

## 2. Auth (headers, token scoping)

Two headers are required on every request:

| Header | Value | Source in spec |
|---|---|---|
| `X-Auth-Token` | API token string | `securitySchemes.header_token` (line 121 184) |
| `X-Organization-Id` | Organization ID string | `parameters.header_organization` (line 100 531) |

The `X-Auth-Token` is defined as an `apiKey` in header. The spec defines no OAuth or Bearer flows — token auth only.

`X-Organization-Id` is marked `required: true` and present as a `$ref` on every operation. Without it the API cannot resolve which tenant's data to return.

The spec does not document token scopes or permission levels beyond the `403 Forbidden` status code returned on access-denied operations.

---

## 3. Base URL and versioning

```
https://api.productive.io/api/v2/
```

All paths in the spec start with `/api/v2/`. There is no version negotiation header; `v2` is baked into the path. No `v1` paths are present in this spec.

Example paths:
```
GET  https://api.productive.io/api/v2/tasks
POST https://api.productive.io/api/v2/tasks
GET  https://api.productive.io/api/v2/tasks/{id}
```

---

## 4. JSON:API request shape (POST / PATCH body)

Content-Type for all request bodies is `application/vnd.api+json`.

All writable attributes are sent under `data.attributes`. There is **no top-level `type` or `id` field required in request bodies** in this spec — IDs appear in path parameters for PATCH/DELETE. Required attributes are declared with `required` arrays inside `data.attributes`.

### POST — create task (line 101 785)

```json
{
  "data": {
    "attributes": {
      "title": "New task",
      "project_id": 6899,
      "task_list_id": 1234,
      "assignee_id": 12,
      "due_date": "2026-06-30",
      "workflow_status_id": 75,
      "custom_fields": { "1001": "value", "1002": 42 }
    }
  }
}
```

Required attributes for task: `title`, `project_id`, `task_list_id`.

### POST — create project (line 102 057)

```json
{
  "data": {
    "attributes": {
      "name": "Website Redesign",
      "project_type_id": 1,
      "project_manager_id": 12,
      "company_id": 65111,
      "workflow_id": 75
    }
  }
}
```

Required: `name`, `project_manager_id`, `project_type_id`.

### PATCH — update task (same body shape; omit unchanged fields)

```json
{
  "data": {
    "attributes": {
      "title": "Updated title",
      "due_date": "2026-07-15"
    }
  }
}
```

---

## 5. JSON:API response shape (data, included, meta, links)

Accept header should be `application/vnd.api+json`. All responses use this content type.

### Single resource response

```json
{
  "data": {
    "id": "42",
    "type": "tasks",
    "attributes": {
      "title": "New task",
      "closed": false,
      "due_date": "2026-06-30",
      "placement": 1000000,
      "created_at": "2026-01-01T09:00:00.000+00:00",
      "custom_fields": { "1001": "value" }
    },
    "relationships": {
      "project": { "data": { "type": "projects", "id": "6899" } },
      "assignee": { "data": { "type": "people", "id": "12" } },
      "task_list": { "data": { "type": "task_lists", "id": "1234" } },
      "workflow_status": { "data": { "type": "workflow_statuses", "id": "75" } },
      "attachments": { "data": [] }
    }
  },
  "meta": {
    "current_page": 1,
    "total_pages": 1,
    "total_count": 1,
    "page_size": 30,
    "max_page_size": 200
  },
  "included": []
}
```

### Collection response

Same structure but `data` is an array. The `meta` block is always present on collection endpoints.

### Relationship not sideloaded

When a related resource is not included via `include`, the relationship block carries a `meta.included: false` marker (line 40 555):

```json
{
  "assignee": {
    "meta": { "included": false }
  }
}
```

### `_meta` schema fields (line 70 446)

| Field | Type | Description |
|---|---|---|
| `current_page` | integer | 1-based current page number |
| `total_pages` | integer | Total pages for current query |
| `total_count` | integer | Total matching records |
| `page_size` | integer | Records per page in this response |
| `max_page_size` | integer | Maximum allowed page size |
| `settings` | object | Org/user settings for UI rendering |
| `organization_features` | object | Feature flags for the org |

---

## 6. List query parameters: filter[], include, sort, fields[], page[]

### Pagination — `page[]`

Pagination is **page-number based**, not cursor-based.

```
GET /api/v2/tasks?page[number]=2&page[size]=50
```

- `page[number]`: 1-based page number
- `page[size]`: Records per page; max varies by endpoint (`max_page_size` in meta, commonly 200)
- Default page size is 30 (from `_meta` example)

The search quick-result endpoint (line 116 826) exposes `per_page` and `next_page` (integer or null) rather than the standard `_meta` block — indicating that endpoint uses a different pagination variant.

### Filtering — `filter[]`

Filters use deep-object style (`style: deepObject`) and nested operator objects.

**Simple equality** (pass the value directly):
```
GET /api/v2/tasks?filter[project_id]=6899
GET /api/v2/tasks?filter[assignee_id][]=12&filter[assignee_id][]=34
```

**Named operators** (wrap in an operator object):
```
GET /api/v2/tasks?filter[due_date][gt]=2026-01-01
GET /api/v2/tasks?filter[title][contains]=design
GET /api/v2/tasks?filter[workflow_status_category_id]=1
```

Supported operators (seen across filter schemas):
- `eq` — exact match
- `not_eq` — not equal
- `contains` — array / substring match
- `not_contain` — exclude
- `gt` — greater than (dates, numbers)
- `gte` — greater than or equal
- `lt` — less than
- `lte` — less than or equal

**Logical groups** — combine conditions with `$op`:
```json
{
  "filter": {
    "$op": "and",
    "0": { "project_id": { "eq": 6899 } },
    "1": { "workflow_status_category_id": { "not_eq": 3 } }
  }
}
```

The `$op` key accepts `"or"` or `"and"`.

Common task filter fields: `project_id`, `assignee_id`, `task_list_id`, `workflow_status_id`, `workflow_status_category_id` (1=not started, 2=started, 3=closed), `due_date`, `due_date_after`, `due_date_before`, `closed_at`, `tag_list`, `type_id`, `custom_fields`.

### Sorting — `sort`

Comma-separated field names. Prefix with `-` for descending order.

```
GET /api/v2/tasks?sort=due_date,-created_at
```

Available task sort fields (line 99 005): `assignee_name`, `billable_time`, `board_name`, `board_position`, `closed_at`, `company_name`, `created_at`, `custom_fields`, `due_date`, `folder_name`, `id`, `initial_estimate`, `last_activity_at`, `number`, `placement`, `project_name`, `remaining_time`, etc.

The `sort` parameter is `style: form`, `explode: false` — send as a single comma-separated value, not array notation.

### Include (sideloading)

The spec defines relationships in responses but the `include` query parameter is not explicitly declared as a named parameter in the OpenAPI spec for most endpoints (it is referenced in purchase_orders description as "sparse fieldsets"). This follows JSON:API convention:

```
GET /api/v2/tasks?include=assignee,project,task_list
```

Relationship names are the keys under `relationships` in each response schema. Task relationships: `creator`, `project`, `service`, `assignee`, `task_list`, `last_actor`, `attachments`, `parent_task`, `organization`, `workflow_status`, `custom_field_people`, `custom_field_attachments`.

### Sparse fieldsets — `fields[]`

Mentioned in the purchase_orders description ("sparse fieldsets"). Standard JSON:API notation:

```
GET /api/v2/tasks?fields[tasks]=title,due_date,assignee_id
```

Not formally declared as a parameter in the spec; treat as supported but undocumented per-resource.

---

## 7. Error envelope and HTTP status codes

### Status codes observed in spec

| Code | Meaning | Used when |
|---|---|---|
| `200` | OK | Successful GET, PATCH, action endpoints |
| `201` | Created | Successful POST |
| `204` | No Content | Successful DELETE |
| `403` | Forbidden | Insufficient permissions |
| `409` | Conflict | Business rule violation (e.g. archive conflict) |
| `422` | Unprocessable Entity | Validation failure (malformed attributes) |

`429 Too Many Requests` is not defined as an OpenAPI response but documented in tag descriptions for specific endpoints (contracts: 50 req/min; salaries: 30 req/2 min).

### Error response body

The `422` and `409` responses declare `application/vnd.api+json` content type but the spec does not define a formal error schema beyond the content-type header. Per JSON:API spec, errors look like:

```json
{
  "errors": [
    {
      "status": "422",
      "title": "Unprocessable Entity",
      "detail": "Title can't be blank",
      "source": { "pointer": "/data/attributes/title" }
    }
  ]
}
```

---

## 8. Pagination strategy

The API uses **page-number pagination** exclusively:

```
GET /api/v2/tasks?page[number]=1&page[size]=30
```

- `page[number]` defaults to 1
- `page[size]` defaults to 30, maximum typically 200 (`max_page_size` from `_meta`)
- The `_meta` block in every collection response tells you `current_page`, `total_pages`, `total_count`, `page_size`, `max_page_size`

**Iteration strategy**: Fetch page 1, read `total_pages`, iterate up to that number. Alternatively, keep fetching until `current_page === total_pages` or data array is empty.

One endpoint (search quick results, line 116 826) uses a different variant: `per_page` and `next_page` (integer or null) — cursor-like but still integer-page-based. Treat that endpoint as an outlier.

There is no cursor-based pagination (no `after` / `before` cursor tokens) in this spec.

---

## 9. Common actions (archive, restore, copy, move, reposition)

All action sub-resources follow the pattern `PATCH /api/v2/{resource}/{id}/{action}` (or `POST` for copy). They accept `X-Organization-Id` in the header and the resource ID in the path. Most take no request body unless additional parameters are needed.

### Archive

```
PATCH /api/v2/tasks/{id}/archive          # (implied — not in spec but boards, companies exist)
PATCH /api/v2/boards/{id}/archive
PATCH /api/v2/companies/{id}/archive
PATCH /api/v2/approval_policies/{id}/archive
PATCH /api/v2/custom_fields/{id}/archive
PATCH /api/v2/deal_statuses/{id}/archive
```

Returns the updated resource or `409 Conflict` if the operation cannot proceed.

### Restore

```
PATCH /api/v2/boards/{id}/restore
PATCH /api/v2/companies/{id}/restore
PATCH /api/v2/approval_policies/{id}/restore
PATCH /api/v2/deleted_items/{id}/restore
```

The `deleted_items` endpoint (line 3 937) is a recycle bin that aggregates soft-deleted items across resource types and allows restore.

### Copy

```
POST /api/v2/boards/copy
POST /api/v2/deals/copy
POST /api/v2/tasks/copy           (line 11 919)
POST /api/v2/folders/copy         (= boards; "folders" is the UI name)
POST /api/v2/expenses/copy
POST /api/v2/dashboards/copy
POST /api/v2/document_styles/copy
POST /api/v2/document_types/copy
POST /api/v2/pages/copy
POST /api/v2/purchase_orders/copy
```

Copy endpoints return `201 Created` or `200 OK`. Request bodies carry copy-specific parameters (e.g. `template_id`, `deal_id` for purchase_order_copy, line 101 577).

### Move

```
PATCH /api/v2/boards/{id}/move
PATCH /api/v2/folders/{id}/move
PATCH /api/v2/task_lists/{id}/move
```

Moves a resource to a different parent (e.g. board to different project).

### Reposition

```
PATCH /api/v2/boards/{id}/reposition
PATCH /api/v2/folders/{id}/reposition
PATCH /api/v2/tasks/{id}/reposition
PATCH /api/v2/task_lists/{id}/reposition
```

Changes display order within a parent. Uses `placement` integer (example value: `1000000`) — a large-gap ordering scheme (common pattern: place at midpoint between neighbours). Request body not formally defined in the spec for most reposition endpoints.

---

## 10. Money / currency handling

**All monetary amounts are integers representing the smallest currency subunit (cents for USD/EUR, etc.).**

Evidence from the spec:
- `resource_expense.amount` — `type: integer`, "Unit cost of the expense in the expense currency" (line 47 619)
- `resource_expense.billable_amount` — `type: integer`, "Amount to be billed to the client" (line 47 590)
- Example amounts: `budget_total: 100000` (= $1,000.00), `unit_price: 1500` (= $15.00), `amount: 15000` (= $150.00), `total_price: 15000` (line 77 685)

Currency is stored as ISO 4217 strings (e.g. `"USD"`, `"GBP"`, `"EUR"`) in a separate `currency` field.

**Multi-currency fields**: Many financial resources expose the same amount in multiple currencies:
- `amount` — original amount in the record's currency
- `amount_default` — converted to the org's default currency
- `amount_normalized` — converted to the org's reporting/normalized currency

Example from `resource_payment` (line 95 589):
- `amount_normalized: 200000` — in normalized currency
- `amount_default: 232000` — in default currency
- `currency: "GBP"` — original currency

**`budget_total`** on services and deals is also an integer (no `type` declared in the schema, but example values `100000` and context "total budget for this service" confirm the integer-cents pattern).

Do not divide by 100 blindly — verify the currency has 2 decimal places (JPY uses 0 decimal places).

---

## 11. Date / time conventions

| Format | Used for | Example |
|---|---|---|
| `date` (ISO 8601) | Calendar dates | `"2026-06-30"` |
| `date-time` (ISO 8601) | Timestamps | `"2026-03-15T10:30:00.000+00:00"` |

- All `date` fields use `YYYY-MM-DD`.
- All `date-time` fields include milliseconds and timezone offset (UTC or local).
- Filter examples consistently use `gt: '2026-01-01'` format — bare date strings for date fields, full ISO strings for datetime fields.
- `closed_at`, `created_at`, `updated_at`, `archived_at`, `deleted_at`, `exported_at` are all `date-time`.
- `due_date`, `start_date`, `paid_on`, `won_date`, `date` (time entries) are all `date`.

---

## 12. Custom fields

### How custom fields are structured

Custom fields are defined globally or per-project via the `/api/v2/custom_fields` and `/api/v2/custom_field_sections` endpoints. Each field has a `data_type_id` controlling its value type.

**`data_type_id` values** (line 274):

| ID | Type |
|---|---|
| 1 | Text field |
| 2 | Number field |
| 3 | Select field (single) |
| 4 | Date field |
| 5 | Multiple select field |
| 6 | Person field |
| 7 | Attachment field |

`customizable_type` values: `deals`, `projects`, `companies`, `budgets`, `invoices`, `tasks`, `bookings`, `project_expenses`, `services`, `employees`, `contacts`, `pages`, `survey_responses`.

### How custom field values appear in attributes

Resources with custom fields carry a `custom_fields` attribute typed as `object` — a flat key/value map keyed by custom field ID:

```json
{
  "attributes": {
    "custom_fields": {
      "1001": "Some text",
      "1002": 42,
      "1003": "2026-06-30",
      "1004": [101, 102]
    }
  }
}
```

Example from `resource_project` (line 22 799):
> "Custom field values for this project, keyed by custom field ID."

### How to write custom fields

Pass `custom_fields` as an object inside `data.attributes` on POST/PATCH (line 101 823 — task body includes `custom_fields: $ref resource_task/properties/custom_fields`).

### Select / multi-select options

Custom field options are managed via `/api/v2/custom_field_options`. Each option has a `custom_field_id` and a name. Pass option IDs (integers) as values for select fields.

### Person and attachment fields

Person-type custom fields create relationships exposed as `custom_field_people` (collection relationship on `_collection_relationship`). Attachment-type fields create `custom_field_attachments` relationship.

These relationships are sideloadable via `include=custom_field_people,custom_field_attachments`.

### Custom field sections

`CustomFieldSection` groups employee custom fields (line 218). Sections are required for employee fields. Other resource custom fields may or may not use sections.

### `aggregation_type_id` for number fields

- `1` = sum
- `2` = average

### `formatting_type_id`

- `1` = decimal
- `2` = percentage

---

## 13. Rate limits

The spec documents **only two explicit rate limits** in tag descriptions:

| Endpoint group | Limit | Location |
|---|---|---|
| Contracts POST (recurring budgets) | 50 requests per minute | Line 195 |
| Salaries PATCH + POST | 30 requests per 2 minutes | Line 1 068 |

No rate limit headers (`X-RateLimit-*`, `Retry-After`) are defined in the OpenAPI spec. No `429 Too Many Requests` response is defined.

**Recommendation for implementation:**
- Assume a general limit of ~60–120 requests/minute for standard endpoints (typical for SaaS APIs).
- Implement exponential backoff when receiving any unexpected `5xx` or `429` response.
- For contract-generation and salary-update operations, enforce client-side throttling of ≤50/min and ≤15/min respectively (conservative margin below documented limits).
- Add `Retry-After` header parsing even though the spec doesn't define it — Productive may send it in practice.

---

## 14. Resource hierarchy diagram

```
Organization
└── Company (companies)
    └── Project (projects)          [company_id on project]
        ├── Board / Folder (boards) [project_id on board; UI calls them "folders"]
        │   └── TaskList (task_lists) [board_id optional; project_id required]
        │       └── Task (tasks)    [task_list_id + project_id required]
        │           ├── Subtask (tasks, parent_task_id set)
        │           ├── Comment (comments)
        │           ├── Attachment (attachments)
        │           └── TimeEntry (time_entries)  [via service_id]
        ├── Deal / Budget (deals)   [company_id on deal; budget: true/false attribute]
        │   ├── Section (sections)
        │   │   └── Service (services / prices)
        │   │       └── TimeEntry (time_entries)
        │   └── Invoice (invoices)
        └── Page (pages)
```

**Key IDs to traverse:**
- `task.project_id` → project
- `task.task_list_id` → task_list → `task_list.board_id` → board → `board.project_id` → project
- `project.company_id` → company
- `deal.company_id` → company
- `service.deal_id` → deal (budget)
- `time_entry.service_id` → service → deal → project

Note: **"boards" and "folders" are the same resource** — the UI calls them folders, the API calls them boards. The API spec notes: "In the application, `boards` are currently referred to as `folders`." Both `/api/v2/boards` and `/api/v2/folders` paths exist and are synonymous (line 82, line 5 264).

---

## 15. Gotchas discovered while reading the spec

1. **Boards = Folders**: Two path prefixes (`/boards` and `/folders`) exist for the same concept. `/folders` paths exist at lines 5 264, 5 283, 5 338, 5 364, 5 382. Always test which path is canonical for your use case.

2. **Deals contain both deals and budgets**: The `/api/v2/deals` endpoint returns and creates both deals and budgets depending on the `budget` boolean attribute (line 332). Filtering by `budget: true` or `budget: false` is necessary to distinguish them.

3. **IDs are strings in JSON but integers in schemas**: The `_resource` schema (line 82 978) types `id` as `integer`, but examples show `"id": "42"` — a string. Always send and receive IDs as strings to avoid parsing errors.

4. **`custom_fields` is a flat map, not a relationships array**: Unlike typical JSON:API patterns, custom field values live inside `attributes.custom_fields` as a plain object, not in `relationships`. Only person and attachment custom field values are exposed as relationships (`custom_field_people`, `custom_field_attachments`).

5. **`placement` field vs `position` field**: Tasks use `placement` (integer, large-gap: 1 000 000 = top). Boards/task_lists use `position`. These are different fields — `position` is 1-indexed sequence, `placement` is a floating-point gap scheme.

6. **`reposition` endpoints rarely define a request body**: The spec omits `requestBody` on most reposition endpoints (e.g. `tasks/{id}/reposition`, line 12 048). You likely need to send `placement` in the body as a conventional JSON:API attributes payload, but this is undocumented. Test empirically.

7. **`deleted_items` is a recycle bin, not a filter**: Soft-deleted tasks/boards/etc. appear in `GET /api/v2/deleted_items`, not via `filter[deleted_at]` on the main endpoint. Many resources expose `deleted_at` as an attribute, but whether soft-deleted records are hidden from the main endpoint by default or included is not explicitly stated.

8. **`meta.included: false` on relationships**: When you don't request `include=`, relationships carry `{ "meta": { "included": false } }` instead of `{ "data": null }`. Consumers must handle both shapes.

9. **Rate limits only documented for two endpoint groups**: Contracts and Salaries have explicit limits; all other endpoints have no documented limit. Assume limits exist and throttle defensively.

10. **No `Authorization: Bearer` support**: Auth is `X-Auth-Token` header only. Standard HTTP Authorization header is not used.

11. **The spec omits the `page[]` parameter from operation definitions**: Page params are not listed under each operation's `parameters` array — they appear to be global conventions. The `_meta` schema (line 70 446) documents the response fields but the request params are inferred from `_meta` field names. Confirm `page[number]` and `page[size]` against actual API behaviour.

12. **`sort` is a single comma-separated string, not an array**: Despite the schema showing `type: array, items: string`, the `explode: false` means it serializes as `sort=due_date,-created_at` not `sort[]=due_date&sort[]=-created_at`.

---

## 16. References (key line numbers in api-master.yaml)

| Topic | Line(s) |
|---|---|
| API paths start | 1 432 |
| `X-Auth-Token` securityScheme | 121 183–121 189 |
| `X-Organization-Id` header parameter | 100 531–100 537 |
| `_meta` schema (pagination) | 70 446–70 491 |
| `_resource` schema (id/type) | 82 978–82 994 |
| `_single_relationship` schema | 16 346–16 365 |
| `_not_included` schema | 40 555–40 576 |
| Task POST endpoint | 11 948–11 970 |
| Task GET endpoint | 11 971–11 984 |
| Task PATCH/DELETE endpoint | 11 985–12 047 |
| Task reposition endpoint | 12 048–12 070 |
| Task requestBody | 101 785–101 849 |
| `filter_task` schema | 14 708–14 807 |
| `_filter_root_task` schema | 49 333–49 364 |
| `sort_task` parameter (enum) | 99 005–99 077 |
| `collection_task` response | 120 467–120 598 |
| `single_task` response | 120 199–120 327 |
| Project requestBody | 102 057–102 099 |
| Board requestBody | 102 397–102 421 |
| Board reposition endpoint | 2 311–2 328 |
| Board copy endpoint | 2 230–2 249 |
| Board move endpoint | 2 285–2 310 |
| Task list requestBody | 104 890–104 917 |
| Deleted items endpoints | 3 923–3 972 |
| `resource_project` schema | 22 795–23 187 |
| `resource_task` schema | 42 301–43 000 |
| `resource_custom_field` schema | 74 413–74 550 |
| Custom field data types (docs) | 274–282 |
| `resource_expense` schema | 47 546–47 650 |
| `resource_service` schema | 84 305–84 450 |
| `resource_payment` schema | 95 589–95 650 |
| Contracts rate limit note | 195 |
| Salaries rate limit note | 1 068 |
| requestBodies section start | 101 576 |
| search quick results (alt pagination) | 116 826–116 836 |
