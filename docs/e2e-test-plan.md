# End-to-End Test Plan: DevPlanner MCP Prompt Refinement

## Overview

Build an end-to-end test that runs the full AutoAgent refinement loop against the DevPlanner MCP example with real Ollama models and real Promptfoo evaluations. The test validates that the loop correctly mutates, evaluates, compares, and persists results — with structured logging for troubleshooting.

### Why DevPlanner MCP?

- Already has a complete example setup (`examples/devplanner-mcp/`) with 4 test cases covering `create_card`, `move_card`, `toggle_task`, and `get_board_overview`
- Uses `buildMcpAssertions()` for structured tool-call validation (not just LLM rubric)
- Has a parallel HTTP variant (`examples/devplanner-http/`) enabling direct MCP vs API comparison
- The DevPlanner project has a real MCP server, making this a realistic integration scenario

---

## Phase 1: Minimal Viable E2E Test

### 1.1 Prerequisite: Wire `evalConfigPath` into the Loop

**Problem:** `evaluatePrompt()` in `src/evaluate.ts` already accepts a `customTests` parameter, but `runRefinementLoop()` in `src/loop.ts` never loads test cases from `config.evalConfigPath`. The DevPlanner example's eval config at `examples/devplanner-mcp/eval-config.ts` is never used during a loop run.

**Fix:** In `src/loop.ts`, before the baseline evaluation (~line 59), add dynamic import logic:

```typescript
// Load custom test cases if evalConfigPath is configured
let customTests: unknown[] | undefined;
if (config.evalConfigPath) {
  const evalConfigAbsPath = resolve(process.cwd(), config.evalConfigPath);
  const evalModule = await import(evalConfigAbsPath);
  customTests = evalModule.default ?? evalModule.testCases;
}
```

Then pass `customTests` to every `evaluatePrompt()` call:

```typescript
const runEval = (prompt: string) =>
  config.retryConfig
    ? evaluateWithRetry(prompt, config, customTests)
    : evaluatePrompt(prompt, config, customTests);
```

**Note:** `evaluateWithRetry` in `src/retry.ts` also needs to accept and forward `customTests`.

### 1.2 Ollama Health Check Helper

Create `tests/e2e/helpers/ollama-check.ts`:

```typescript
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

export async function assertOllamaReady(requiredModels: string[]): Promise<void> {
  // 1. Check Ollama is reachable
  let tags: { models: { name: string }[] };
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    tags = await res.json();
  } catch {
    throw new Error(
      `Ollama is not reachable at ${OLLAMA_BASE_URL}. ` +
      `Start it with: ollama serve`
    );
  }

  // 2. Check required models are pulled
  const available = new Set(tags.models.map(m => m.name.split(':')[0]));
  const missing = requiredModels.filter(m => !available.has(m.split(':')[0]));
  if (missing.length > 0) {
    throw new Error(
      `Missing Ollama models: ${missing.join(', ')}. ` +
      `Pull them with: ${missing.map(m => `ollama pull ${m}`).join(' && ')}`
    );
  }
}
```

### 1.3 Shared Test Harness

Create `tests/e2e/helpers/run-example.ts`:

```typescript
import { resolve } from 'path';
import { copyFileSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { runRefinementLoop } from '../../../src/loop.js';
import type { AutoAgentConfig, LoopSummary } from '../../../src/types.js';

interface ExampleRunOptions {
  exampleDir: string;
  configOverrides?: Partial<AutoAgentConfig>;
  preserveTempDir?: boolean;
}

interface ExampleRunResult {
  summary: LoopSummary;
  tempDir: string;
  originalPrompt: string;
  finalPrompt: string;
}

export async function runExampleLoop(opts: ExampleRunOptions): Promise<ExampleRunResult> {
  const { exampleDir, configOverrides = {} } = opts;
  const absExampleDir = resolve(process.cwd(), exampleDir);

  // Copy target.md to a temp dir so the loop can mutate it safely
  const tempDir = mkdtempSync(resolve(tmpdir(), 'autoagent-e2e-'));
  const tempTargetPath = resolve(tempDir, 'target.md');
  copyFileSync(resolve(absExampleDir, 'target.md'), tempTargetPath);

  const originalPrompt = readFileSync(tempTargetPath, 'utf-8');

  const config: AutoAgentConfig = {
    targetPromptPath: tempTargetPath,
    programPath: resolve(absExampleDir, 'program.md'),
    evalConfigPath: resolve(absExampleDir, 'eval-config.ts'),
    mutationModel: 'ministral-3:latest',
    targetModels: ['ministral-3:latest'],
    judgeModel: 'ministral-3:latest',
    maxIterations: 3,
    targetScoreDelta: 0.5,
    plateauThreshold: 3,
    improvementThreshold: 0.02,
    gitEnabled: false,
    autoCommit: false,
    autoRevert: false,
    maxConcurrency: 1,
    writeLatestResults: false,
    evalTemperature: 0.3,
    mutationTemperature: 0.8,
    judgeTemperature: 0.2,
    ...configOverrides,
  };

  try {
    const summary = await runRefinementLoop(config, false);
    const finalPrompt = readFileSync(tempTargetPath, 'utf-8');
    return { summary, tempDir, originalPrompt, finalPrompt };
  } finally {
    if (!opts.preserveTempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
```

### 1.4 E2E Test File

Create `tests/e2e/devplanner-mcp.e2e.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { assertOllamaReady } from './helpers/ollama-check.js';
import { runExampleLoop } from './helpers/run-example.js';
import type { LoopSummary } from '../../src/types.js';

const TEST_MODEL = 'ministral-3:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

describe('DevPlanner MCP — full refinement loop', () => {
  beforeAll(async () => {
    await assertOllamaReady([TEST_MODEL]);
  }, 30_000);

  it('runs the loop and returns a valid LoopSummary', async () => {
    const { summary, originalPrompt, finalPrompt } = await runExampleLoop({
      exampleDir: 'examples/devplanner-mcp',
      configOverrides: {
        mutationModel: TEST_MODEL,
        targetModels: [TEST_MODEL],
        judgeModel: TEST_MODEL,
        maxIterations: 3,
      },
    });

    // --- Structural validity ---
    expect(summary.totalIterations).toBeGreaterThanOrEqual(1);
    expect(summary.baselineScore).toBeGreaterThanOrEqual(0);
    expect(summary.baselineScore).toBeLessThanOrEqual(1);
    expect(summary.finalScore).toBeGreaterThanOrEqual(0);
    expect(summary.finalScore).toBeLessThanOrEqual(1);
    expect(['max_iterations', 'target_delta_reached', 'plateau']).toContain(summary.stopReason);

    // --- Iteration details populated ---
    for (const iter of summary.iterations) {
      expect(iter.iteration).toBeGreaterThanOrEqual(1);
      expect(iter.timestamp).toBeTruthy();
      expect(['improved', 'reverted', 'mutation_failed', 'eval_failed']).toContain(iter.status);
    }

    // --- Accounting identity ---
    const statusCounts = summary.improvementCount + summary.revertCount + summary.failureCount;
    expect(statusCounts).toBe(summary.totalIterations);

    // --- Cumulative delta is non-negative (regressions are reverted) ---
    expect(summary.cumulativeDelta).toBeGreaterThanOrEqual(0);

    // --- File mutation check ---
    if (summary.improvementCount > 0) {
      expect(finalPrompt).not.toBe(originalPrompt);
    } else {
      expect(finalPrompt).toBe(originalPrompt);
    }
  }, 300_000); // 5-minute timeout
});
```

### 1.5 Vitest Configuration

Create `vitest.e2e.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 300_000,
    environment: 'node',
    globals: false,
  },
});
```

Update `vitest.config.ts` to exclude e2e:

```typescript
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    globals: false,
  },
});
```

Add npm scripts to `package.json`:

```json
{
  "test": "vitest run",
  "test:e2e": "vitest run --config vitest.e2e.config.ts",
  "test:all": "vitest run && vitest run --config vitest.e2e.config.ts"
}
```

---

## Phase 2: Structured Logging

### 2.1 Logger Module

Add `pino` as a dependency. Create `src/logger.ts`:

- `createRunLogger(runId, opts?)` — returns a pino instance with:
  - Configurable log level (default: `info`, set via `LOG_LEVEL` env var)
  - Dual output: pretty-printed to stdout + JSON to `./logs/run-{runId}.log`
  - Base context: `{ runId, startedAt }`
- `getLogger()` — singleton accessor for use across modules

### 2.2 Logging Integration Points

| File | What to Log | Level |
|------|------------|-------|
| `src/loop.ts` | Loop start config, baseline score, iteration progress, stop conditions, summary | `info` |
| `src/loop.ts` | Mutation/eval errors with full context | `error` |
| `src/ollama.ts` | Model name, response length, duration | `info` |
| `src/ollama.ts` | Full request body + response content | `debug` |
| `src/evaluate.ts` | Test count, model count, raw summary | `debug` |
| `src/mutate.ts` | Raw response length, parse success/failure, fallback step used | `debug` |

### 2.3 Timing Capture

Add `performance.now()` timing around each phase in the loop. Extend `IterationSummary` in `src/types.ts`:

```typescript
interface IterationSummary {
  // ... existing fields ...
  timings?: {
    mutationMs: number;
    evalMs: number;
    totalMs: number;
  };
}
```

Also capture and log:
- Baseline evaluation duration
- Full loop wall-clock duration
- Per-iteration breakdown

### 2.4 Ollama Request/Response Logging

This is the highest-value debugging addition. When a mutation fails to parse, you need to see what the model actually returned.

In `src/ollama.ts`, modify `callOllama()` to:
- Log at `debug`: full request body (model, messages, temperature) and full response content
- Log at `info`: model name, response content length, duration in milliseconds
- Log at `error`: full response text on HTTP errors or parse failures

### 2.5 Log File Per Run

Each refinement loop run writes to `./logs/run-{runId}.log` as NDJSON (newline-delimited JSON). This provides:
- Machine-parseable output for automated analysis
- Grep-friendly format: `grep '"level":50' run-*.log` to find all errors
- Full Ollama I/O at debug level for reproduction

### 2.6 E2E Test Logging Assertions

After the loop completes, verify:
- Log file exists and contains valid NDJSON
- Contains entries for baseline, mutation, and eval phases
- Error-level entries exist only when `summary.failureCount > 0`

---

## Phase 3: MCP vs HTTP Comparison

### 3.1 Comparison Test

Create `tests/e2e/devplanner-comparison.e2e.test.ts`:

```typescript
describe('DevPlanner: MCP vs HTTP comparison', () => {
  let mcpResult, httpResult;

  it('runs MCP variant', async () => {
    mcpResult = await runExampleLoop({ exampleDir: 'examples/devplanner-mcp' });
  }, 300_000);

  it('runs HTTP variant', async () => {
    httpResult = await runExampleLoop({ exampleDir: 'examples/devplanner-http' });
  }, 300_000);

  it('both produce valid results with non-negative improvement', () => {
    for (const result of [mcpResult, httpResult]) {
      expect(result.summary.baselineScore).toBeGreaterThanOrEqual(0);
      expect(result.summary.cumulativeDelta).toBeGreaterThanOrEqual(0);
    }
  });

  it('generates comparison report', () => {
    const report = {
      mcp: {
        baseline: mcpResult.summary.baselineScore,
        final: mcpResult.summary.finalScore,
        delta: mcpResult.summary.cumulativeDelta,
        iterations: mcpResult.summary.totalIterations,
        improvements: mcpResult.summary.improvementCount,
      },
      http: {
        baseline: httpResult.summary.baselineScore,
        final: httpResult.summary.finalScore,
        delta: httpResult.summary.cumulativeDelta,
        iterations: httpResult.summary.totalIterations,
        improvements: httpResult.summary.improvementCount,
      },
    };

    // Log for human review — don't assert which is "better"
    console.log('\n=== MCP vs HTTP Comparison ===');
    console.log(JSON.stringify(report, null, 2));
  });
});
```

### 3.2 What We're Comparing

The MCP and HTTP examples test the same DevPlanner operations but validate different output formats:
- **MCP**: Expects `{"name": "tool_name", "arguments": {...}}` JSON
- **HTTP**: Expects valid `curl` commands with correct URL, method, headers, and body

Running both through the refinement loop answers: does the prompt refinement process improve tool-call accuracy differently depending on the output format? This reveals whether MCP's structured format gives the model an advantage (or disadvantage) over free-form HTTP commands.

---

## Implementation Sequence

| Step | Description | Files | Depends On |
|------|-------------|-------|------------|
| 1 | Wire `evalConfigPath` into `runRefinementLoop` | `src/loop.ts`, `src/retry.ts` | — |
| 2 | Create Ollama health-check helper | `tests/e2e/helpers/ollama-check.ts` | — |
| 3 | Create shared e2e test harness | `tests/e2e/helpers/run-example.ts` | Step 1 |
| 4 | Write DevPlanner MCP e2e test | `tests/e2e/devplanner-mcp.e2e.test.ts` | Steps 1–3 |
| 5 | Add vitest e2e config + npm scripts | `vitest.e2e.config.ts`, `vitest.config.ts`, `package.json` | Step 4 |
| 6 | Install pino, create logger module | `src/logger.ts`, `package.json` | — |
| 7 | Replace console.log in loop | `src/loop.ts` | Step 6 |
| 8 | Add Ollama request/response logging | `src/ollama.ts` | Step 6 |
| 9 | Add timing capture | `src/loop.ts`, `src/types.ts` | Step 7 |
| 10 | Add log assertions to e2e test | `tests/e2e/devplanner-mcp.e2e.test.ts` | Steps 6–9 |
| 11 | Write MCP vs HTTP comparison test | `tests/e2e/devplanner-comparison.e2e.test.ts` | Steps 3–5 |

Steps 1–5 are the minimal viable e2e test. Steps 6–10 add structured logging. Step 11 adds comparison.

---

## Running the Tests

```bash
# Prerequisites
ollama serve                    # start Ollama
ollama pull ministral-3:latest  # pull the test model

# Unit tests only (fast, no Ollama needed)
npm test

# E2E tests (requires Ollama)
npm run test:e2e

# All tests
npm run test:all
```

### Environment

- **Ollama:** Running locally (default `http://localhost:11434`)
- **DevPlanner MCP server:** Running at `http://localhost:3000`
- **Test model:** `ministral-3:latest`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM nondeterminism — scores vary between runs | Assert structural properties (valid types, score ranges, accounting identity), not specific score values |
| Slow execution — 3 iterations can take 2–4 minutes | Keep `maxIterations: 3`, use smallest viable model, add a `maxIterations: 1` smoke variant if needed |
| Missing models — test silently uses defaults | `beforeAll` health check fails fast with explicit `ollama pull` instructions |
| File system side effects — loop writes to disk | Use temp directories, clean up in `finally` block, disable git and `writeLatestResults` |
| `evalConfigPath` not wired — test runs with wrong test cases | This is the Phase 1 prerequisite; must be fixed before anything else works |
