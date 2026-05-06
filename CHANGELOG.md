# Changelog

All notable changes to `productive-mcp-rb2` are documented here.

## [2.0.0-alpha.1] — 2026-05-06

### M1: Foundation — bug fixes + client refactor + test harness

This alpha introduces the v2 foundation. No new tools; refactor only. The
full tool surface (30 tools) is preserved with identical behaviour.

#### Bug Fixes
- **Server version** (`productive-mcp-evf`): `initialize` now reads the version
  from `package.json` instead of the hardcoded `"1.0.0"`.
- **Time-entries export typo** (`productive-mcp-j4g`): renamed
  `listTimeEntresTool` → `listTimeEntriesTool`.
- **Task status display** (`productive-mcp-gl4`): `list_tasks` now reads
  `attributes.closed` (boolean) instead of `attributes.status` (number).
- **Bookings filter** (`productive-mcp-oyi`): `listBookings` params unified to
  `after` / `before`; the internal translation maps to `started_on_after` /
  `started_on_before`.
- **get_task raw fetch** (`productive-mcp-hkl`): `get_task` routed through
  `Core.request()` — no more direct `fetch` in the handler.

#### Refactoring
- **`src/api/core.ts`** (`productive-mcp-e74`): new `Core` class wrapping
  `fetch` with header injection, JSON:API error mapping, and retry delegation.
  All API calls now pass through a single chokepoint.
- **`src/api/retry.ts`** (`productive-mcp-1ak`): `withRetry()` honours
  `Retry-After` on 429; exponential back-off on 5xx up to 3 attempts.
- **`src/api/paginate.ts`** (`productive-mcp-958`): `paginateAll()` follows
  `links.next` until `meta.total_count` is reached or a safety cap is hit.
- **`src/api/include-resolver.ts`** (`productive-mcp-u7u`): `IncludeResolver`
  builds a `type:id → resource` map from the `included` array; resolves JSON:API
  relationships in one pass.
- **Per-resource modules** (`productive-mcp-bfb`): `src/api/client.ts`
  (1108 LOC) split into `src/api/core.ts` + 20 resource modules under
  `src/api/resources/`. Each module is ≤200 LOC. `client.ts` retained as a
  thin facade for backward compatibility during M1.

#### Infrastructure
- **Vitest harness** (`productive-mcp-ybv`): Vitest 4.x + `@vitest/coverage-v8`
  + `undici` MockAgent. Coverage thresholds: 80% lines / 75% branches. No
  live API calls in tests.
- **Build policy** (`productive-mcp-7jq`): `build/` is now `.gitignore`d;
  `prepublishOnly` rebuilds from source on `npm publish`.
- **Test suite** (`productive-mcp-0om`): 169 tests across 19 files lock the
  current tool surface before M2 modernization. Branch coverage: 81.3%.

### Upgrade notes

This is a pre-release (`-alpha.1`). No breaking changes to the MCP tool surface.
If you consume `src/api/client.ts` directly (not via MCP), update imports to
the new per-resource modules.

---

## [1.2.0] and earlier

See git history for v1.x changes.
