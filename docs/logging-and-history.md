# AutoAgent — Logging & History Implementation Plan

> **Purpose**: Expose and enhance AutoAgent's existing logging and experiment-history infrastructure. Three gaps exist today: (1) no CLI to view past runs, (2) history files are never read back to prevent the mutation agent from repeating prior experiments, and (3) the `./logs/` and `./history/` directories are undocumented. This plan addresses all three.

> **Companion docs**: [mvp-implementation-plan.md](mvp-implementation-plan.md) (core architecture), [TASK.md](TASK.md) (task tracker)

---

## Current State

The following infrastructure already exists and must **not** be replaced:

| File | What it does |
|------|-------------|
| `src/logger.ts` | Custom logger writing JSON Lines to `./logs/run-${runId}.log`; console output; `LOG_LEVEL` env var |
| `src/history.ts` | `writeRunHistory()`, `loadRunHistory()`, `listRunHistories()` — reads/writes `./history/run-${timestamp}.json` |
| `src/types.ts` | `LoopSummary` and `IterationSummary` interfaces define what is recorded per run and per iteration |
| `src/results-store.ts` | Partial results in `./partial-results/` for crash-recovery gap-fill |

**What `LoopSummary` records per run:** `startTime`, `endTime`, `totalIterations`, `improvementCount`, `revertCount`, `failureCount`, `cumulativeDelta`, `finalScore`, `baselineScore`, `stopReason`, `iterations[]`

**What `IterationSummary` records per iteration:** `iteration`, `status` ('improved'|'reverted'|'mutation_failed'|'eval_failed'), `changeSummary` (one-liner description of the proposed change), `rationale`, `beforeScore`, `afterScore`, `scoreDelta`, `perModelDeltas`, `error`, `timestamp`, `timings` (mutationMs, evalMs, totalMs)

---

## Component A — History Viewer CLI

### Goal

Expose `bun run src/index.ts history [file]` to print a formatted table of past runs or a per-iteration detail view.

### A1 — Add format functions to `src/history.ts`

Add three new **exported** functions. Keep them pure (input → string output) so they are easily unit-tested without filesystem mocks.

```typescript
/**
 * Human-readable duration, e.g. "2m 34s", "45s", "1h 3m"
 */
export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Plain-text table listing all runs.
 * Columns: Run (timestamp), Duration, Iters, Baseline, Final, Delta, Stop Reason
 * Scores formatted as percentages to one decimal place (e.g. 72.3%).
 * Delta uses +/- prefix.
 */
export function formatRunTable(summaries: LoopSummary[], filePaths: string[]): string

/**
 * Header row + per-iteration breakdown table for a single run.
 * Iteration columns: Iter, Status, Change Summary (≤60 chars), Before, After, Delta, Duration
 * Failed iterations show error text instead of scores.
 * Status labels: improved, reverted, mut_fail, eval_fail
 */
export function formatRunDetail(summary: LoopSummary, filePath: string): string
```

**Implementation notes:**
- Use `String.prototype.padEnd` / `padStart` for column alignment — no external table library.
- `formatRunTable` receives both `summaries` and `filePaths` (parallel arrays) so it can print filenames in the Run column without needing to re-derive paths.
- Truncate `changeSummary` at 60 characters with `…` suffix if longer.
- For score percentage: `(score * 100).toFixed(1) + '%'`
- Delta: `scoreDelta >= 0 ? '+' + delta.toFixed(3) : delta.toFixed(3)`

### A2 — Register Commander subcommand in `src/index.ts`

```typescript
import { listRunHistories, loadRunHistory, formatRunTable, formatRunDetail } from './history.js';

program
  .command('history [file]')
  .description('List past runs or show per-iteration detail for a specific run file')
  .option('--dir <path>', 'History directory to read from', './history')
  .action(async (file: string | undefined, opts: { dir: string }) => {
    if (file) {
      const summary = await loadRunHistory(file);
      console.log(formatRunDetail(summary, file));
    } else {
      const paths = await listRunHistories(opts.dir);
      if (paths.length === 0) {
        console.log('No run history found in ' + opts.dir);
        return;
      }
      const summaries = await Promise.all(paths.map(loadRunHistory));
      console.log(formatRunTable(summaries, paths));
    }
  });
```

**Note:** Register this subcommand **before** `program.parse()`. Commander treats the first positional argument as the subcommand name, so `history` must be a `.command()` and not conflict with existing flags.

### A3 — Unit tests: `tests/history-viewer.test.ts` (new file)

Use vitest. All tests use inline fixture data — no filesystem I/O.

Test cases to cover:
- `formatDuration`: sub-minute (e.g. 45s), over a minute (2m 34s), over an hour (1h 3m)
- `formatRunTable` with 0 summaries: returns empty string or single "no runs" message — pick one and be consistent
- `formatRunTable` with 2 fixture `LoopSummary` objects: assert header row present, both run timestamps appear in output, scores show `%` suffix
- `formatRunDetail` with a fixture run: assert per-iteration rows appear, `eval_fail` status rows show error text, long `changeSummary` is truncated to 60 chars + `…`

---

## Component B — Cross-run Mutation Deduplication

### Goal

Before proposing a mutation, load `changeSummary` strings from recent past runs and inject them into the mutation agent's system prompt so it does not repeat experiments tried in prior sessions.

### B1 — Config flags in `src/types.ts`

Add to the `AutoAgentConfig` interface:

```typescript
/** If true, inject prior run change summaries into mutation prompt. Default: false */
useHistoryContext?: boolean;
/** How many recent run files to scan for prior summaries. Default: 5 */
historyContextRuns?: number;
```

### B2 — Extend Zod schema in `src/config.ts`

Add to the schema object:

```typescript
useHistoryContext: z.boolean().default(false),
historyContextRuns: z.number().int().positive().default(5),
```

Add to `DEFAULT_CONFIG`:

```typescript
useHistoryContext: false,
historyContextRuns: 5,
```

### B3 — `loadPriorChangeSummaries` in `src/history.ts`

```typescript
/**
 * Load changeSummary strings from the most recent `maxRuns` history files.
 * De-duplicates via Set. Silently skips corrupt/unreadable files.
 * Guards against slice(-0) returning the full array by clamping maxRuns to >= 1.
 */
export async function loadPriorChangeSummaries(
  historyDir?: string,
  maxRuns = 5,
): Promise<string[]> {
  const paths = await listRunHistories(historyDir);
  const recentPaths = paths.slice(-Math.max(1, maxRuns));
  const summaries: string[] = [];
  for (const p of recentPaths) {
    try {
      const run = await loadRunHistory(p);
      for (const iter of run.iterations) {
        if (iter.changeSummary) summaries.push(iter.changeSummary);
      }
    } catch {
      // skip corrupt or unreadable history files
    }
  }
  return [...new Set(summaries)];
}
```

**Design notes:**
- `listRunHistories` returns paths sorted ascending by filename (ISO timestamp), so `slice(-N)` = most recent N runs.
- The current run's history file has not been written yet when this is called, so there is no risk of loading it.
- `Math.max(1, maxRuns)` is required: `Array.prototype.slice(-0)` returns the **full** array, not an empty slice, which would be a silent bug if `historyContextRuns` is set to 0.

### B4 — Update `src/mutate.ts`

Update `buildMutationUserPrompt` (and its caller `mutatePrompt`) to accept a new optional parameter:

```typescript
function buildMutationUserPrompt(
  currentPrompt: string,
  evalFeedback: EvalFeedback | null,
  iterationHistory: IterationSummary[],
  priorChangeSummaries: string[] = [],   // NEW
): string {
  // ... existing sections ...

  const priorSection = priorChangeSummaries.length > 0
    ? `\n## Previously tried approaches (from prior runs — do not repeat)\n` +
      priorChangeSummaries.map(s => `- ${s}`).join('\n')
    : '';

  return `${existingSections}${priorSection}`;
}
```

Also update the exported `mutatePrompt` function signature:

```typescript
export async function mutatePrompt(
  currentPrompt: string,
  evalFeedback: EvalFeedback | null,
  iterationHistory: IterationSummary[],
  config: AutoAgentConfig,
  priorChangeSummaries: string[] = [],   // NEW
): Promise<MutationResult>
```

Thread `priorChangeSummaries` through to `buildMutationUserPrompt`.

### B5 — Load summaries once in `src/loop.ts`

Add before the baseline evaluation (after `initLogger`):

```typescript
// Load prior run summaries for cross-run deduplication
const priorChangeSummaries: string[] = config.useHistoryContext
  ? await loadPriorChangeSummaries(undefined, config.historyContextRuns)
  : [];

if (priorChangeSummaries.length > 0) {
  logger.info('Loaded prior change summaries for history context', {
    count: priorChangeSummaries.length,
    runs: config.historyContextRuns,
  });
}
```

Then pass `priorChangeSummaries` into `mutatePrompt` at the call site inside the loop body.

### B6 — Unit tests (add to `tests/history-viewer.test.ts` or new `tests/history-dedup.test.ts`)

- `loadPriorChangeSummaries` with mocked `listRunHistories` / `loadRunHistory`:
  - Returns de-duplicated summaries across multiple runs
  - Respects `maxRuns` limit (returns only from the last N files)
  - Skips a corrupt file (one that throws on `loadRunHistory`) without throwing
  - `maxRuns: 0` — clamped to 1, does not return the full history
- `buildMutationUserPrompt` with non-empty `priorChangeSummaries`:
  - Output contains "Previously tried approaches" section
  - Each summary appears as a list item
- `buildMutationUserPrompt` with empty `priorChangeSummaries`:
  - "Previously tried approaches" section is absent from output

---

## Component C — README Updates

### C1 — Table of Contents

Add after the `- [Promptfoo Integration](#promptfoo-integration)` entry:

```markdown
- [Logs & History](#logs--history)
```

### C2 — New section: "Logs & History"

Insert between the **Promptfoo Integration** section and the **Project Structure** section:

````markdown
## Logs & History

AutoAgent persists two types of artifacts for observability and experiment tracking:

### `./logs/` — Structured event log

One JSON Lines file per run: `logs/run-${runId}.log`. Each line is a JSON object:

```json
{"level":20,"levelName":"info","time":"2026-04-05T10:23:01.456Z","runId":"2026-04-05T10-23-00-000Z","msg":"Baseline evaluation complete","phase":"baseline","score":0.62,"durationMs":4120}
```

| Field | Description |
|-------|-------------|
| `level` | Numeric level: 10=debug, 20=info, 30=warn, 40=error |
| `levelName` | Human-readable level |
| `time` | ISO 8601 timestamp |
| `runId` | Identifies which run produced this log entry |
| `msg` | Log message |
| *(additional fields)* | Structured data passed by the caller (phase, score, durationMs, etc.) |

Control verbosity:

```bash
LOG_LEVEL=debug bun run start   # show all debug-level events (verbose)
LOG_LEVEL=warn  bun run start   # show only warnings and errors
```

Default: `info`.

---

### `./history/` — Run history

One JSON file per completed run: `history/run-${timestamp}.json`. Not written during `--dry-run`.

**Top-level fields (`LoopSummary`):**

| Field | Description |
|-------|-------------|
| `startTime` / `endTime` | ISO timestamps for the full run |
| `totalIterations` | Number of iterations attempted |
| `improvementCount` | Iterations where score improved and change was kept |
| `revertCount` | Iterations where change was reverted |
| `failureCount` | Iterations that failed (mutation or eval error) |
| `baselineScore` / `finalScore` | Composite scores at start and end |
| `cumulativeDelta` | Total score improvement over the run |
| `stopReason` | Why the loop stopped: `max_iterations`, `target_delta_reached`, `plateau` |
| `iterations` | Array of per-iteration records (see below) |

**Per-iteration fields (`IterationSummary`):**

| Field | Description |
|-------|-------------|
| `iteration` | Iteration number (1-based) |
| `status` | `improved`, `reverted`, `mutation_failed`, `eval_failed` |
| `changeSummary` | One-line description of the proposed mutation |
| `rationale` | Why the mutation agent proposed this change |
| `beforeScore` / `afterScore` | Composite scores before and after |
| `scoreDelta` | `afterScore - beforeScore` |
| `perModelDeltas` | Per-model score changes (detects overfitting) |
| `error` | Error message if `status` is `*_failed` |
| `timestamp` | When this iteration started |
| `timings.mutationMs` | Time to generate the mutation |
| `timings.evalMs` | Time to evaluate the new prompt |
| `timings.totalMs` | Total iteration time |

---

### Viewing history

Use the `history` subcommand to inspect past runs without opening JSON files manually:

```bash
# List all past runs (table view)
bun run src/index.ts history

# Per-iteration detail for a specific run
bun run src/index.ts history ./history/run-2026-04-05T10-23-00-000Z.json

# Use a non-default history directory
bun run src/index.ts history --dir ./my-history
```

Example table output:

```
Run                           Duration   Iters   Baseline   Final    Delta    Stop Reason
2026-04-05T10-23-00-000Z      2m 34s     8/20    62.0%      74.5%   +0.125   plateau
2026-04-05T14-01-00-000Z      4m 12s     20/20   74.5%      81.2%   +0.067   max_iterations
```

---

### Cross-run deduplication

Enable `useHistoryContext` to prevent the mutation agent from proposing changes it already tried in previous runs:

```typescript
// auto-agent.config.ts
export default {
  // ... other config
  useHistoryContext: true,     // inject prior changeSummary strings into mutation prompt
  historyContextRuns: 5,       // how many recent run files to scan (default: 5)
};
```

When enabled, AutoAgent loads `changeSummary` strings from the most recent N run files at startup and injects them into the mutation agent's prompt as a "Previously tried approaches — do not repeat" section.

**Notes:**
- Opt-in (default: `false`) to avoid prompt bloat for users who haven't accumulated history yet.
- De-duplicates across files — the same summary from multiple runs appears only once.
- Silently skips corrupt or unreadable history files.
- `historyContextRuns: 0` is clamped to 1 (minimum one run of context).
````

### C3 — Configuration Reference table

Add two rows to the existing configuration table (after `retryConfig`):

```markdown
| `useHistoryContext` | boolean | `false` | Inject prior run change summaries into mutation prompt to avoid repeating experiments |
| `historyContextRuns` | number | `5` | Number of recent run history files to scan for prior summaries |
```

### C4 — Project Structure annotations

In the project structure directory tree, add inline comments to `logs/` and `history/`:

```
├── logs/                         # Structured JSON Lines event logs (one file per run)
├── history/                      # Run summaries in JSON (LoopSummary, one file per run)
```

---

## Verification

### History viewer

1. Run `bun run src/index.ts --iterations 3` to produce a history file.
2. Confirm `./history/` contains a new `run-*.json` file.
3. Run `bun run src/index.ts history` — verify table shows one row with correct duration, score percentages, and stop reason.
4. Run `bun run src/index.ts history ./history/run-<timestamp>.json` — verify 3 iteration rows appear, each showing status and timing.
5. Run `bun run test` — all new tests in `tests/history-viewer.test.ts` pass.

### Cross-run deduplication

1. Configure `useHistoryContext: true` in `auto-agent.config.ts`.
2. Run AutoAgent once (at least 2 iterations).
3. Add a temporary `logger.debug('Mutation user prompt', { prompt: userMessage })` in `src/mutate.ts`.
4. Run AutoAgent a second time — confirm the logged mutation prompt contains a "Previously tried approaches" section listing summaries from the first run.
5. Remove the temporary log line.
6. Run `bun run test` — all deduplication unit tests pass.

### Edge cases to verify

| Scenario | Expected behavior |
|----------|-------------------|
| First run (empty `./history/`) | `loadPriorChangeSummaries` returns `[]`; section absent from prompt; no error |
| Corrupt history file | Silently skipped; other files still loaded |
| `--dry-run` flag | Existing behavior: `writeRunHistory` is not called; `history` viewer still works on pre-existing files |
| `history` subcommand with nonexistent file path | Node throws `ENOENT`; Commander catches and prints the error |
| `historyContextRuns: 0` | Clamped to 1 by `Math.max(1, maxRuns)` |

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `src/history.ts` | Add `formatDuration`, `formatRunTable`, `formatRunDetail`, `loadPriorChangeSummaries` |
| `src/index.ts` | Register `history` Commander subcommand; import new format functions |
| `src/types.ts` | Add `useHistoryContext?` and `historyContextRuns?` to `AutoAgentConfig` |
| `src/config.ts` | Extend Zod schema and `DEFAULT_CONFIG` with new fields |
| `src/mutate.ts` | Add `priorChangeSummaries` parameter to `buildMutationUserPrompt` and `mutatePrompt` |
| `src/loop.ts` | Load prior summaries once before loop; pass to `mutatePrompt` |
| `README.md` | New "Logs & History" section, ToC entry, config table rows, project structure annotations |
| `tests/history-viewer.test.ts` | New — unit tests for format functions and `loadPriorChangeSummaries` |
