import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { assertOllamaReady } from './helpers/ollama-check.js';
import { runExampleLoop } from './helpers/run-example.js';

const TEST_MODEL = process.env.TEST_MODEL ?? 'ministral-3:latest';

describe('DevPlanner MCP — full refinement loop', () => {
  beforeAll(async () => {
    await assertOllamaReady([TEST_MODEL]);
  }, 30_000);

  it('runs the loop and returns a valid LoopSummary', async () => {
    const { summary, originalPrompt, finalPrompt, logPath } = await runExampleLoop({
      exampleDir: 'examples/devplanner-mcp',
      preserveTempDir: true, // keep temp file to read finalPrompt
      configOverrides: { maxIterations: 3 },
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

    // --- Cumulative delta is non-negative (regressions are always reverted) ---
    expect(summary.cumulativeDelta).toBeGreaterThanOrEqual(0);

    // --- File mutation check ---
    if (summary.improvementCount > 0) {
      expect(finalPrompt).not.toBe(originalPrompt);
    } else {
      expect(finalPrompt).toBe(originalPrompt);
    }

    // --- Timing data present on successful iterations ---
    const completedIters = summary.iterations.filter(
      i => i.status === 'improved' || i.status === 'reverted',
    );
    for (const iter of completedIters) {
      expect(iter.timings).toBeDefined();
      expect(iter.timings!.mutationMs).toBeGreaterThan(0);
      expect(iter.timings!.evalMs).toBeGreaterThan(0);
      expect(iter.timings!.totalMs).toBeGreaterThan(0);
    }

    // --- Log file written ---
    if (logPath) {
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      // Each line must be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      // Log must contain baseline phase entry
      const entries = lines.map(l => JSON.parse(l) as Record<string, unknown>);
      const hasBaseline = entries.some(e => e['phase'] === 'baseline');
      expect(hasBaseline).toBe(true);
    }
  }, 300_000);
});
