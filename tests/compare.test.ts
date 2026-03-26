import { describe, it, expect } from 'vitest';
import { compareResults } from '../src/compare.js';
import type { EvalResult, AutoAgentConfig } from '../src/types.js';

// Minimal config stub used by every test
const baseConfig: AutoAgentConfig = {
  targetPromptPath: './prompts/target.md',
  programPath: './program.md',
  mutationModel: 'qwen3:32b',
  ollamaBaseUrl: 'http://localhost:11434',
  targetModels: ['modelA'],
  judgeModel: 'qwen3:32b',
  maxIterations: 20,
  targetScoreDelta: 0.3,
  plateauThreshold: 5,
  evalTemperature: 0.3,
  mutationTemperature: 0.8,
  judgeTemperature: 0.2,
  improvementThreshold: 0.02,
  gitEnabled: false,
  autoCommit: false,
  autoRevert: false,
  maxConcurrency: 2,
  writeLatestResults: false,
};

function makeResult(composite: number, modelScores: Record<string, number>): EvalResult {
  return {
    compositeScore: composite,
    modelScores,
    testCaseResults: [],
    rawSummary: null,
  };
}

describe('compareResults', () => {
  describe('Rule 1 — improvement >= threshold → KEEP', () => {
    it('keeps when composite score improves by exactly the threshold', () => {
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.72, { modelA: 0.72 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('keep');
      expect(result.scoreDelta).toBeCloseTo(0.02);
      expect(result.hasModelRegression).toBe(false);
    });

    it('keeps when composite score improves well above threshold', () => {
      const before = makeResult(0.50, { modelA: 0.50 });
      const after  = makeResult(0.80, { modelA: 0.80 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('keep');
      expect(result.scoreDelta).toBeCloseTo(0.30);
      expect(result.reason).toMatch(/improved/i);
    });

    it('reports correct before/after scores in keep result', () => {
      const before = makeResult(0.60, { modelA: 0.60 });
      const after  = makeResult(0.65, { modelA: 0.65 });
      const result = compareResults(before, after, baseConfig);
      expect(result.beforeScore).toBeCloseTo(0.60);
      expect(result.afterScore).toBeCloseTo(0.65);
    });

    it('computes per-model deltas correctly on keep', () => {
      const before = makeResult(0.65, { modelA: 0.60, modelB: 0.70 });
      const after  = makeResult(0.70, { modelA: 0.65, modelB: 0.75 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('keep');
      expect(result.perModelDeltas['modelA']).toBeCloseTo(0.05);
      expect(result.perModelDeltas['modelB']).toBeCloseTo(0.05);
    });
  });

  describe('Rule 2 — model regression > 0.1 → REVERT', () => {
    it('reverts when one model drops by more than 0.1', () => {
      const before = makeResult(0.80, { modelA: 0.80, modelB: 0.80 });
      // modelB drops by 0.15 (regression), modelA improves
      const after  = makeResult(0.825, { modelA: 0.90, modelB: 0.65 });
      // composite improved, but modelB regressed
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.hasModelRegression).toBe(true);
      expect(result.reason).toMatch(/regression/i);
    });

    it('reverts even when composite score improved due to model regression', () => {
      const before = makeResult(0.60, { modelA: 0.60, modelB: 0.60 });
      const after  = makeResult(0.75, { modelA: 0.95, modelB: 0.45 }); // modelB drops 0.15
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.hasModelRegression).toBe(true);
    });

    it('keeps when model drop is exactly 0.1 (boundary — not regression)', () => {
      const before = makeResult(0.70, { modelA: 0.70, modelB: 0.70 });
      const after  = makeResult(0.725, { modelA: 0.85, modelB: 0.60 }); // modelB drops exactly 0.10
      // 0.60 - 0.70 = -0.10 which is NOT > 0.1 (strict greater-than)
      const result = compareResults(before, after, baseConfig);
      // delta of 0.025 >= threshold 0.02 and no regression (−0.10 is not < −0.1)
      expect(result.hasModelRegression).toBe(false);
      expect(result.decision).toBe('keep');
    });

    it('includes regressed model name in reason string', () => {
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.80, { modelA: 0.55 }); // -0.15 regression
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.reason).toContain('modelA');
    });
  });

  describe('Rule 3 — composite decreased → REVERT', () => {
    it('reverts when composite score drops', () => {
      const before = makeResult(0.80, { modelA: 0.80 });
      const after  = makeResult(0.75, { modelA: 0.75 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.scoreDelta).toBeCloseTo(-0.05);
    });

    it('reverts even on a very small composite decrease', () => {
      const before = makeResult(0.801, { modelA: 0.801 });
      const after  = makeResult(0.800, { modelA: 0.800 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.scoreDelta).toBeLessThan(0);
    });
  });

  describe('Rule 4 — noise (delta < threshold) → REVERT', () => {
    it('reverts when improvement is below the threshold', () => {
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.71, { modelA: 0.71 }); // +0.01, threshold is 0.02
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
      expect(result.scoreDelta).toBeCloseTo(0.01);
      expect(result.reason).toMatch(/threshold/i);
    });

    it('reverts on zero delta', () => {
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.70, { modelA: 0.70 });
      const result = compareResults(before, after, baseConfig);
      expect(result.decision).toBe('revert');
    });

    it('respects a custom improvementThreshold from config', () => {
      const strictConfig = { ...baseConfig, improvementThreshold: 0.10 };
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.75, { modelA: 0.75 }); // +0.05, below 0.10 threshold
      const result = compareResults(before, after, strictConfig);
      expect(result.decision).toBe('revert');
    });
  });

  describe('multi-model handling', () => {
    it('computes per-model deltas for models present only in after result', () => {
      const before = makeResult(0.70, { modelA: 0.70 });
      const after  = makeResult(0.75, { modelA: 0.80, modelB: 0.70 });
      const result = compareResults(before, after, baseConfig);
      // modelB was not in before → before score treated as 0
      expect(result.perModelDeltas['modelB']).toBeCloseTo(0.70);
    });

    it('treats missing after-model score as 0 for delta calculation', () => {
      const before = makeResult(0.70, { modelA: 0.70, modelB: 0.70 });
      const after  = makeResult(0.70, { modelA: 0.70 }); // modelB missing in after
      const result = compareResults(before, after, baseConfig);
      expect(result.perModelDeltas['modelB']).toBeCloseTo(-0.70);
    });
  });
});
