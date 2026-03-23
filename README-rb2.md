# productive-mcp-rb2

Extends the [berwickgeek/productive-mcp](https://github.com/berwickgeek/productive-mcp) MCP server with rb2-specific delivery operations tooling.

## New Tools (rb2 extensions)

### `get_budget_burn`
Analyse budget burn across rb2 projects. Returns budget value, invoiced amount, burn %, remaining budget, and RAG status per deal.

- 🟢 < 70% burned
- 🟡 70–90% burned
- 🔴 > 90% burned (at risk)

**Parameters:**
- `project_id` *(optional)* — Filter to a specific project
- `status` *(optional)* — `"active"` (default) or `"all"`
- `limit` *(optional)* — Max deals to analyse (1–50, default 20)

---

### `get_resource_plan`
Get the rb2 resource plan — team bookings and utilization for a date range. Shows who is booked, on which project, hours/day, and utilization %.

**Parameters:**
- `after` *(optional)* — Start date `YYYY-MM-DD` (default: today)
- `before` *(optional)* — End date `YYYY-MM-DD` (default: +4 weeks)
- `person_name` *(optional)* — Filter by person name (partial match, case-insensitive)
- `project_id` *(optional)* — Filter by project ID

---

### `get_overbooked_people`
Detect rb2 team members with overlapping bookings that exceed a capacity threshold. Returns each overbooked person with total hours/day and conflicting bookings.

**Parameters:**
- `after` *(optional)* — Start date `YYYY-MM-DD` (default: today)
- `before` *(optional)* — End date `YYYY-MM-DD` (default: +4 weeks)
- `threshold_pct` *(optional)* — Overbooking threshold % (default: 100 = fully booked)

---

### `get_org_overview`
High-level snapshot of rb2 org: active projects and headcount per subsidiary (NL, SCAPE, Code Blue, CN, PT, NG).

**Parameters:**
- `after` *(optional)* — Start date filter for time entries
- `before` *(optional)* — End date filter for time entries

---

## Configuration

Same environment variables as the base `productive-mcp`:

| Variable | Required | Description |
|---|---|---|
| `PRODUCTIVE_API_TOKEN` | ✅ | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | ✅ | Your Productive.io organisation ID (`46890` for rb2) |
| `PRODUCTIVE_API_BASE_URL` | ✅ | API base URL (e.g. `https://api.productive.io/api/v2/`) |
| `PRODUCTIVE_USER_ID` | optional | Your Productive.io user ID — enables "me" context for task assignment |

## MCP config (Claude Desktop / OpenClaw)

```json
{
  "mcpServers": {
    "productive-rb2": {
      "command": "node",
      "args": ["/path/to/productive-mcp-rb2/build/index.js"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your-token",
        "PRODUCTIVE_ORG_ID": "46890",
        "PRODUCTIVE_API_BASE_URL": "https://api.productive.io/api/v2/",
        "PRODUCTIVE_USER_ID": "your-user-id"
      }
    }
  }
}
```

## Build

```bash
npm install
npm run build
```

## Updating local MCP install

Choose the update flow based on your setup:

- `npx` config: restart your MCP host and it will pull the latest published package.
- Global install:
  ```bash
  npm install -g productive-mcp-rb2@latest
  npm ls -g productive-mcp-rb2 --depth=0
  ```
- Local checkout (`node /path/to/build/index.js`):
  ```bash
  git pull
  npm install
  npm run build
  ```

After updating, restart Claude Desktop / Cursor / Claude Code to reload the server binary.

## Automated npm publishing

GitHub Actions workflow: `.github/workflows/npm-publish.yml`

- Publishes on every push to `main`
- Skips publishing if current `package.json` version already exists on npm
- Requires repository secret `NPM_TOKEN`

Release with:

```bash
npm version patch
git push
```
