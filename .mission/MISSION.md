# Active Missions

| Slug | Status | Started | Path | Notes |
|------|--------|---------|------|-------|
| productive-mcp-v2 | shaped — ready for /mission-execute | 2026-05-06 | `.mission/productive-mcp-v2/` | 7 milestones, 172 features, 100+ assertions; bd graph seeded |

## productive-mcp-v2

Comprehensive overhaul of `productive-mcp-rb2`: bug fixes, codebase restructure, MCP modernization (McpServer + structuredContent + elicitation + completion + ResourceLinks + StreamableHTTP), and tool coverage expansion from ~30 to ~110 tools.

**Milestones (bd epics):**
1. M1 Foundation (`productive-mcp-3b8`) — bug fixes + client refactor + retry/paginate/include resolver + Vitest harness
2. M2 MCP modernization (`productive-mcp-1gn`) — McpServer + structuredContent + elicitation + completion + ResourceLinks
3. M3 Reports (`productive-mcp-eeg`) — 24 report tools
4. M4 Approvals + Finance writes (`productive-mcp-wyh`) — 33 tools
5. M5 Org + Resourcing (`productive-mcp-ty8`) — 28 tools
6. M6 Knowledge + Pipeline + Comm (`productive-mcp-jnr`) — 43 tools
7. M7 StreamableHTTP + 2.0 release (`productive-mcp-ab3`) — transport + final release

**Run:**
```bash
bd ready --json   # see what's spawnable next
/mission-execute productive-mcp-v2
```
