import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { assertOllamaReady } from './helpers/ollama-check.js';
import { runExampleLoop } from './helpers/run-example.js';
import type { LoopSummary } from '../../src/types.js';

const TEST_MODEL = process.env.TEST_MODEL ?? 'ministral-3:latest';

describe('DevPlanner: MCP vs HTTP comparison', () => {
  let mcpSummary: LoopSummary;
  let httpSummary: LoopSummary;

  beforeAll(async () => {
    await assertOllamaReady([TEST_MODEL]);
  }, 30_000);

  it('runs MCP variant', async () => {
    const result = await runExampleLoop({
      exampleDir: 'examples/devplanner-mcp',
      configOverrides: { maxIterations: 3 },
    });
    mcpSummary = result.summary;
    expect(mcpSummary).toBeDefined();
  }, 300_000);

  it('runs HTTP variant', async () => {
    const result = await runExampleLoop({
      exampleDir: 'examples/devplanner-http',
      configOverrides: { maxIterations: 3 },
    });
    httpSummary = result.summary;
    expect(httpSummary).toBeDefined();
  }, 300_000);

  it('both variants produce structurally valid results', () => {
    for (const summary of [mcpSummary, httpSummary]) {
      expect(summary.baselineScore).toBeGreaterThanOrEqual(0);
      expect(summary.baselineScore).toBeLessThanOrEqual(1);
      expect(summary.finalScore).toBeGreaterThanOrEqual(0);
      expect(summary.finalScore).toBeLessThanOrEqual(1);
      // Regressions are always reverted so cumulative delta must be non-negative
      expect(summary.cumulativeDelta).toBeGreaterThanOrEqual(0);
    }
  });

  it('writes a comparison report', () => {
    const report = {
      timestamp: new Date().toISOString(),
      model: TEST_MODEL,
      mcp: {
        baseline: mcpSummary.baselineScore,
        final: mcpSummary.finalScore,
        delta: mcpSummary.cumulativeDelta,
        iterations: mcpSummary.totalIterations,
        improvements: mcpSummary.improvementCount,
        stopReason: mcpSummary.stopReason,
      },
      http: {
        baseline: httpSummary.baselineScore,
        final: httpSummary.finalScore,
        delta: httpSummary.cumulativeDelta,
        iterations: httpSummary.totalIterations,
        improvements: httpSummary.improvementCount,
        stopReason: httpSummary.stopReason,
      },
    };

    const logsDir = resolve(process.cwd(), 'logs');
    mkdirSync(logsDir, { recursive: true });
    const reportPath = resolve(logsDir, `comparison-${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n=== MCP vs HTTP Comparison ===');
    console.log(`MCP  baseline=${(report.mcp.baseline * 100).toFixed(1)}%  final=${(report.mcp.final * 100).toFixed(1)}%  delta=+${(report.mcp.delta * 100).toFixed(1)}%`);
    console.log(`HTTP baseline=${(report.http.baseline * 100).toFixed(1)}%  final=${(report.http.final * 100).toFixed(1)}%  delta=+${(report.http.delta * 100).toFixed(1)}%`);
    console.log(`Report saved to: ${reportPath}`);

    // Structural assertion on the report itself
    expect(report.mcp.baseline).toBeTypeOf('number');
    expect(report.http.baseline).toBeTypeOf('number');
  });
});
