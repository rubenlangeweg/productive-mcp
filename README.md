# productive-mcp-rb2

[![npm version](https://badge.fury.io/js/productive-mcp-rb2.svg)](https://www.npmjs.com/package/productive-mcp-rb2)

An MCP (Model Context Protocol) server for [Productive.io](https://productive.io), extended with delivery-focused tools for budget burn, resource planning, and org overview.

Based on [berwickgeek/productive-mcp](https://github.com/berwickgeek/productive-mcp) — extended by [Ruben Langeweg](https://github.com/rubenlangeweg).

## Features

### Core (Productive.io)
- **Companies & Projects** — list with status filtering
- **Task Management** — list, create, update, reposition, assign
- **Task Operations** — comments, status updates, workflow statuses, sprints
- **Board & Task List Management** — create and manage boards and lists
- **People Management** — list people with filtering options
- **Time Entries** — log and list time entries with date/person/project filters
- **Deals & Services** — list deals and services per project
- **Activity Tracking** — recent updates across your organisation
- **User Context** — supports "me" references when `PRODUCTIVE_USER_ID` is configured

### rb2 Delivery Tools (extended)
- **`get_budget_burn`** — budget vs actuals per project: burn %, remaining, RAG status (🟢🟡🔴)
- **`get_resource_plan`** — team bookings and utilisation for a date range
- **`get_overbooked_people`** — detect team members with overlapping bookings above a capacity threshold
- **`get_org_overview`** — active projects and people per subsidiary (NL, CN, PT, NG, SCAPE, Code Blue)

## Installation

### Via npx (no install required)

```bash
npx productive-mcp-rb2
```

### Global install

```bash
npm install -g productive-mcp-rb2
```

## Configuration

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PRODUCTIVE_API_TOKEN` | ✅ | Your Productive.io API token |
| `PRODUCTIVE_ORG_ID` | ✅ | Your organisation ID |
| `PRODUCTIVE_USER_ID` | Optional | Your user ID (required for `my_tasks`) |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "productive": {
      "command": "npx",
      "args": ["-y", "productive-mcp-rb2"],
      "env": {
        "PRODUCTIVE_API_TOKEN": "your_api_token",
        "PRODUCTIVE_ORG_ID": "your_org_id",
        "PRODUCTIVE_USER_ID": "your_user_id"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code

```bash
claude mcp add productive -- npx -y productive-mcp-rb2
```

Then set your environment variables in `~/.zshrc` or `~/.bashrc`:

```bash
export PRODUCTIVE_API_TOKEN="your_api_token"
export PRODUCTIVE_ORG_ID="your_org_id"
export PRODUCTIVE_USER_ID="your_user_id"
```

## Getting your credentials

1. Log in to [Productive.io](https://productive.io)
2. Go to **Settings → API integrations**
3. Generate a new token
4. Copy your **API token** and **Organisation ID**

To find your user ID: use the `whoami` tool after setup, or check your profile URL in Productive.io.

## rb2 Delivery Tools

### `get_budget_burn`
Analyse budget burn across projects. Returns burn %, remaining budget, and RAG status per deal.

```
"Show me budget burn for all active projects"
"Which projects are over 80% burned?"
```

### `get_resource_plan`
View team bookings and utilisation for a date range.

```
"Show me the resource plan for the next 4 weeks"
"What is Marthin booked on this month?"
```

### `get_overbooked_people`
Detect team members with overlapping bookings exceeding capacity.

```
"Who is overbooked this month?"
"Check for overbooking above 90% capacity next 2 weeks"
```

### `get_org_overview`
High-level snapshot of active projects and people per subsidiary.

```
"Give me an org overview"
"How many active projects does rb2 NL have?"
```

## Repository

[github.com/rubenlangeweg/productive-mcp](https://github.com/rubenlangeweg/productive-mcp)

## License

ISC
