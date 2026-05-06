# Mission Interfaces — Productive MCP v2

> Contracts every sub-agent (worker) must conform to. Read this before claiming any bd issue.

## 1. Handoff format

On completion, each worker produces a handoff markdown block. The orchestrator appends it to the feature's bd issue notes. Match this template exactly:

```markdown
### Salient Summary
<1-2 sentences: what was done and key evidence>

### What Was Implemented
<detailed description of changes — list the files touched, the new/renamed exports, and the wire-up changes in src/server.ts>

### What Was Left Undone
<anything deferred or explicitly out of scope; "nothing" is acceptable when complete>

### Verification
Commands run:
- `npm run build` — exit 0 — type-check + emit clean
- `npm test -- <pattern>` — exit 0 — N passed
- `<other commands as needed>` — exit code — observation

Interactive checks:
- <if applicable: hit a tool via the MCP Inspector / vitest e2e — describe the action and result>

### Tests Added
- `<test file path>` — `<test name>` — verifies `VAL-AREA-NNN`
- (one line per test, mapping to the assertion it proves)

### Discovered Issues
- [non-blocking] <description> (affects <feature-id or cross-cutting>)
- [blocking] <description> (must be resolved before <downstream feature>)
- (or "none")
```

A worker that cannot produce all sections is not done. Return to orchestrator instead.

## 2. Commit convention

- One commit per feature, message format: `<bd-id>: <short imperative description>`
- bd issue ID matches the issue id exactly (e.g. `bd-0042: split api/client.ts into core + resources`)
- No multi-feature commits — split if scope grew
- Commits include the handoff in the body so the bd notes line up with git history when both are read together
- Standard commit footer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (per repo convention)
- Conventional-commit prefixes also welcome (`fix:`, `feat:`, `refactor:`) but the bd-id MUST be the first token

Example commit:

```
bd-0103: register report_time_entries tool with structuredContent

feat: wire reports/time_entries via McpServer.registerTool, dual-output, fixture-driven test.

Touches src/api/resources/reports.ts, src/tools/reports/time-entries.ts,
src/server.ts (one new registerTool call), tests/tools/reports/time-entries.test.ts,
tests/fixtures/reports/time_entries.basic.json.

Verifies VAL-REPORTS-22.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## 3. File ownership

| Path | Owner during mission | Notes |
|------|----------------------|-------|
| `src/index.ts` | core-engineer (M1, M7) | Transport bootstrap; touched only in M1 (no behaviour change) and M7 (HTTP transport) |
| `src/server.ts` | core-engineer (M2) for the rewrite; tool-builder (M3–M6) appends `registerTool` calls only | M2 owner converts the dispatch switch to McpServer; later milestones MUST use the same registration pattern and only add lines in alphabetical groups within the existing structure |
| `src/api/core.ts` | core-engineer | Created in M1; modified by anyone later only with explicit handoff to core-engineer |
| `src/api/include-resolver.ts`, `src/api/retry.ts`, `src/api/paginate.ts` | core-engineer | M1 only |
| `src/api/resources/<resource>.ts` | the worker who introduces or touches the matching tool | One file per resource family |
| `src/tools/<resource>.ts` (or `src/tools/<family>/<tool>.ts`) | tool-builder or write-flow-builder per feature | Co-located test |
| `src/elicit/confirm.ts` | core-engineer (M2) | Shared destructive-tool helper |
| `src/prompts/<name>.ts` | tool-builder (M2 for completion handlers) | |
| `src/resources/index.ts` | tool-builder (M2 for ResourceTemplate migration; M5 part 1 for rb2 resources) | |
| `src/transport/http.ts` | core-engineer (M7) | New |
| `src/config/index.ts`, `src/config/rb2.ts` | core-engineer | Other workers must not modify |
| `tests/setup.ts`, `tests/helpers/*.ts` | core-engineer (M1) | New helpers added later require core-engineer review via handoff |
| `tests/fixtures/<resource>/*.json` | the worker adding the test | |
| `tests/<area>.test.ts` | the worker for that area | Co-locate as `<file>.test.ts` next to the source where natural; otherwise place under `tests/<area>/<file>.test.ts` |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | core-engineer | Workers may NOT add dependencies without escalating |
| `README.md`, `README-rb2.md`, `CHANGELOG.md`, `MIGRATION.md` | core-engineer (M7); each milestone's last feature MUST update CHANGELOG | |
| `.github/workflows/*.yml` | core-engineer | |
| `build/` | machine-generated; never edit by hand | Treat as a build artifact, not source |
| `api-master.yaml` | reference only — read, never edit | |
| `.mission/productive-mcp-v2/**` | mission orchestrator only | Workers reference but don't modify |

**Conflict resolution:** if two workers need the same file in the same milestone, the earlier-claimed feature owns it; the later worker rebases its changes on top. If the conflict is structural (e.g. both need to register tools in `server.ts`), workers append in alphabetical sections separated by `// ─── <Section> ────` banners — no overlapping edits.

## 4. Shared state rules

- Workers MUST read `AGENTS.md` before starting any feature
- Workers MUST NOT modify files outside their declared ownership without flagging in `Discovered Issues` and escalating
- DB schema changes are not a thing in this project — there is no DB
- No new env var without documenting it in `AGENTS.md` AND `README.md`
- No new npm dependency without explicit handoff to core-engineer; if a worker thinks one is needed, return to orchestrator instead of adding it silently
- All Productive API calls go through `src/api/core.ts` (its `request()` function or its derivatives) — no direct `fetch()` from tools
- Workers MUST NOT log to stdout in any code path (the stdio transport is on stdout — corrupting it breaks the protocol)
- Workers MAY log to stderr ONLY when in HTTP transport mode AND only via the project's logger helper (added in M1)

## 5. Validation gate

Before marking a feature complete, every worker MUST:

1. **Type-check** — `npm run build` exits 0 (TypeScript strict mode, zero errors)
2. **Lint** — if `npm run lint` is wired up by M1, it exits 0
3. **Tests** — `npm test` for the area touched exits 0; new tests added prove the assertions listed in `Tests Added`
4. **Coverage delta** — `npm test -- --coverage` shows no drop below 80% lines for the touched area
5. **Manual verification** — for tool features: register the tool, call it via the in-memory transport in a vitest e2e, observe both `content[0].text` AND `structuredContent` parse cleanly
6. **Schema parity** — for tool features: assert the returned `structuredContent` validates against the registered `outputSchema` (via the shared test helper)

## 6. Error escalation

Return to the orchestrator (do NOT silently work around) when:

- A precondition is not met (e.g. `bd show <id>` shows blocking deps still open)
- Requirements ambiguous after reading `mission.md`, `validation-contract.md`, `AGENTS.md`, and the relevant `library/*.md`
- A cross-cutting concern affects multiple features (e.g. a Productive API quirk that should be solved in `core.ts`)
- The TypeScript build won't pass even after a clean rebuild
- An npm dependency is needed
- A test fixture would require live API access that's not available
- A tool surface change conflicts with a decision already locked in `mission.md` §4

## 7. Scrutiny review output

Each scrutiny finding (raised at the end of a milestone) becomes a child `bd` task:
- `type: task`
- label: `scrutiny`
- relations: `discovered-from:<parent-feature>`, `blocks:<parent-feature>`
- description: the finding text + reproduction steps + suggested fix

The orchestrator may also create `fix-<short>` features that resolve scrutiny findings; those features carry `discovered-from:<scrutiny-task>` AND `blocks:<affected-feature>` so the milestone can't be re-validated until they're closed.

## 8. Tool registration template

Every tool feature MUST register via this exact pattern in `src/server.ts`:

```typescript
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// In the registration block (alphabetised by name within section banners):
server.registerTool(
  'list_companies',
  {
    title: 'List companies',
    description: 'List companies (clients) in your Productive organisation. Filter by active/archived status.',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      title: 'List companies',
    },
    inputSchema: listCompaniesInputSchema.shape,
    outputSchema: listCompaniesOutputSchema.shape,
  },
  listCompaniesHandler(client, config),
);
```

Where `listCompaniesInputSchema` / `listCompaniesOutputSchema` are Zod objects exported from the matching tool file, and `listCompaniesHandler` is a curried handler that returns the `(args) => Promise<CallToolResult>` McpServer expects.

The handler MUST return:
```typescript
return {
  content: [
    { type: 'text', text: humanReadableMarkdown },
    // optional: { type: 'resource_link', uri, name } for create-flows
  ],
  structuredContent: parsedAndValidated,
};
```

For destructive tools, the handler MUST first call the shared `confirmOrDryRun({ title, summary, args, capabilities })` helper from `src/elicit/confirm.ts`. If it returns `{ kind: 'dry-run' }`, return the planned-action result without making the API call. If `{ kind: 'confirmed' }`, proceed.

## 9. Test template

Every tool MUST have at least three tests:

```typescript
// tests/tools/<resource>.test.ts
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/<resource>/list.json';
import { runTool, withFetchMock } from '../helpers/index.js';
import { server } from '../../src/server.js'; // or registered via the test harness

describe('list_<resource>', () => {
  it('returns text + structuredContent', async () => {
    const result = await withFetchMock(
      [{ method: 'GET', path: '/<resource>', response: fixture }],
      () => runTool('list_<resource>', { limit: 30 }),
    );
    expect(result.content[0].type).toBe('text');
    expect(result.structuredContent).toBeDefined();
    // schema parity:
    expect(() => listResourceOutputSchema.parse(result.structuredContent)).not.toThrow();
  });

  it('handles empty list', async () => { /* ... */ });
  it('surfaces 401 as McpError(-32603)', async () => { /* ... */ });
});
```

Destructive tools add:

```typescript
it('refuses without confirmation', async () => { /* dry_run not set, no elicitation -> McpError */ });
it('honors dry_run', async () => { /* returns plan without fetching */ });
it('proceeds with confirm: true', async () => { /* observed PATCH/POST */ });
```

## 10. Fixture capture rules

- Fixtures live under `tests/fixtures/<resource>/<scenario>.json`
- Capture from a real Productive API response when possible (we have a token)
- Strip personally identifying info: replace real names with `Test User`, real emails with `test@example.com`
- Keep IDs realistic (string numerals)
- Document in a comment at the top of the fixture file: `// captured 2026-MM-DD from /<endpoint>?<params>`
- Fixtures that test error paths can be hand-written from the spec
- Do NOT capture fixtures with sensitive financial data — use synthetic numbers

## 11. Worker boundaries (summary)

- `core-engineer` (skills/core-engineer/SKILL.md) — M1 foundation, M2 modernization platform, M7 transport + release
- `tool-builder` (skills/tool-builder/SKILL.md) — most tool features in M2 retrofit + M3 reports + M5 org/resourcing reads + M6 reads
- `write-flow-builder` (skills/write-flow-builder/SKILL.md) — destructive tools in M4 approvals/finance, M5 mutations, M6 page write/publish + deal lifecycle + discussion mutations
- `scrutiny-reviewer` (skills/scrutiny-reviewer/SKILL.md) — milestone-end review

The orchestrator picks the worker based on the bd feature's `worker_type` annotation (recorded in the issue body).
