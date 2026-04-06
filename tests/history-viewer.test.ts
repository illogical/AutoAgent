import { describe, it, expect, vi } from 'vitest';
import { formatDuration, formatRunTable, formatRunDetail } from '../src/history.js';
import type { LoopSummary, IterationSummary } from '../src/types.js';

function makeIterationSummary(overrides: Partial<IterationSummary> = {}): IterationSummary {
  return {
    iteration: 1,
    status: 'improved',
    changeSummary: 'Added formatting instructions',
    rationale: 'Test cases required specific format',
    beforeScore: 0.62,
    afterScore: 0.68,
    scoreDelta: 0.06,
    perModelDeltas: { 'qwen3:8b': 0.06 },
    timestamp: '2026-04-05T10:23:01.000Z',
    timings: { mutationMs: 2000, evalMs: 3000, totalMs: 5000 },
    ...overrides,
  };
}

function makeLoopSummary(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    startTime: '2026-04-05T10:23:00.000Z',
    endTime: '2026-04-05T10:25:34.000Z',
    totalIterations: 8,
    improvementCount: 3,
    revertCount: 4,
    failureCount: 1,
    cumulativeDelta: 0.125,
    finalScore: 0.745,
    baselineScore: 0.62,
    stopReason: 'plateau',
    iterations: [
      makeIterationSummary({ iteration: 1 }),
      makeIterationSummary({ iteration: 2, status: 'reverted', scoreDelta: -0.02, afterScore: 0.60 }),
      makeIterationSummary({
        iteration: 3,
        status: 'eval_failed',
        error: 'Eval error: Connection refused',
        beforeScore: undefined,
        afterScore: undefined,
        scoreDelta: undefined,
      }),
    ],
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('formats sub-minute duration', () => {
    const result = formatDuration('2026-04-05T10:23:00.000Z', '2026-04-05T10:23:45.000Z');
    expect(result).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    const result = formatDuration('2026-04-05T10:23:00.000Z', '2026-04-05T10:25:34.000Z');
    expect(result).toBe('2m 34s');
  });

  it('formats hours and minutes', () => {
    const result = formatDuration('2026-04-05T10:00:00.000Z', '2026-04-05T11:03:00.000Z');
    expect(result).toBe('1h 3m');
  });

  it('formats zero duration', () => {
    const result = formatDuration('2026-04-05T10:00:00.000Z', '2026-04-05T10:00:00.000Z');
    expect(result).toBe('0s');
  });

  it('formats exactly one minute', () => {
    const result = formatDuration('2026-04-05T10:00:00.000Z', '2026-04-05T10:01:00.000Z');
    expect(result).toBe('1m 0s');
  });
});

describe('formatRunTable', () => {
  it('returns empty string for 0 summaries', () => {
    expect(formatRunTable([], [])).toBe('');
  });

  it('formats a table with header for 2 summaries', () => {
    const s1 = makeLoopSummary();
    const s2 = makeLoopSummary({
      startTime: '2026-04-05T14:01:00.000Z',
      endTime: '2026-04-05T14:05:12.000Z',
      totalIterations: 20,
      finalScore: 0.812,
      baselineScore: 0.745,
      cumulativeDelta: 0.067,
      stopReason: 'max_iterations',
    });

    const paths = [
      './history/run-2026-04-05T10-23-00-000Z.json',
      './history/run-2026-04-05T14-01-00-000Z.json',
    ];

    const output = formatRunTable([s1, s2], paths);

    // Header row present
    expect(output).toContain('Run');
    expect(output).toContain('Duration');
    expect(output).toContain('Baseline');
    expect(output).toContain('Final');
    expect(output).toContain('Stop Reason');

    // Both run timestamps appear
    expect(output).toContain('2026-04-05T10-23-00-000Z');
    expect(output).toContain('2026-04-05T14-01-00-000Z');

    // Scores show % suffix
    expect(output).toContain('62.0%');
    expect(output).toContain('74.5%');
    expect(output).toContain('81.2%');

    // Stop reasons
    expect(output).toContain('plateau');
    expect(output).toContain('max_iterations');
  });
});

describe('formatRunDetail', () => {
  it('shows run header with correct values', () => {
    const summary = makeLoopSummary();
    const output = formatRunDetail(summary, './history/run-2026-04-05T10-23-00-000Z.json');

    expect(output).toContain('Run: 2026-04-05T10-23-00-000Z');
    expect(output).toContain('Duration: 2m 34s');
    expect(output).toContain('Baseline: 62.0%');
    expect(output).toContain('Final: 74.5%');
    expect(output).toContain('Stop Reason: plateau');
  });

  it('shows per-iteration rows', () => {
    const summary = makeLoopSummary();
    const output = formatRunDetail(summary, './history/run-2026-04-05T10-23-00-000Z.json');

    // All 3 iterations appear
    expect(output).toContain('improved');
    expect(output).toContain('reverted');
    expect(output).toContain('eval_fail');
  });

  it('shows error text for failed iterations', () => {
    const summary = makeLoopSummary();
    const output = formatRunDetail(summary, './history/run-test.json');

    expect(output).toContain('Connection refused');
  });

  it('truncates long changeSummary to 60 chars with ellipsis', () => {
    const longSummary = 'A'.repeat(80);
    const iter = makeIterationSummary({ changeSummary: longSummary });
    const summary = makeLoopSummary({ iterations: [iter] });
    const output = formatRunDetail(summary, './history/run-test.json');

    // Should contain the truncated version (60 chars + …)
    expect(output).toContain('A'.repeat(60) + '…');
    expect(output).not.toContain('A'.repeat(61) + '…');
  });
});
