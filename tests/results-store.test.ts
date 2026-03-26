import { describe, it, expect } from 'vitest';
import { findGaps } from '../src/results-store.js';

describe('findGaps', () => {
  it('returns all pairs when nothing is completed', () => {
    const gaps = findGaps([], 2, ['modelA', 'modelB']);
    expect(gaps).toHaveLength(4);
    expect(gaps).toContainEqual({ testIndex: 0, model: 'modelA' });
    expect(gaps).toContainEqual({ testIndex: 0, model: 'modelB' });
    expect(gaps).toContainEqual({ testIndex: 1, model: 'modelA' });
    expect(gaps).toContainEqual({ testIndex: 1, model: 'modelB' });
  });

  it('returns no gaps when all pairs are completed', () => {
    const completed = [
      { testIndex: 0, model: 'modelA' },
      { testIndex: 0, model: 'modelB' },
      { testIndex: 1, model: 'modelA' },
      { testIndex: 1, model: 'modelB' },
    ];
    const gaps = findGaps(completed, 2, ['modelA', 'modelB']);
    expect(gaps).toHaveLength(0);
  });

  it('identifies exactly the missing pair', () => {
    const completed = [
      { testIndex: 0, model: 'modelA' },
      { testIndex: 0, model: 'modelB' },
      { testIndex: 1, model: 'modelA' },
      // missing: testIndex=1, model=modelB
    ];
    const gaps = findGaps(completed, 2, ['modelA', 'modelB']);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ testIndex: 1, model: 'modelB' });
  });

  it('returns all pairs for 0 total tests', () => {
    const gaps = findGaps([], 0, ['modelA']);
    expect(gaps).toHaveLength(0);
  });

  it('handles a single model correctly', () => {
    const completed = [{ testIndex: 0, model: 'modelA' }];
    const gaps = findGaps(completed, 3, ['modelA']);
    expect(gaps).toHaveLength(2);
    expect(gaps).toContainEqual({ testIndex: 1, model: 'modelA' });
    expect(gaps).toContainEqual({ testIndex: 2, model: 'modelA' });
  });

  it('handles many models and many tests efficiently', () => {
    const models = ['m1', 'm2', 'm3'];
    const totalTests = 10;
    // Complete first 5 tests for all models
    const completed = [];
    for (let i = 0; i < 5; i++) {
      for (const m of models) {
        completed.push({ testIndex: i, model: m });
      }
    }
    const gaps = findGaps(completed, totalTests, models);
    // Should have 5 remaining tests × 3 models = 15 gaps
    expect(gaps).toHaveLength(15);
  });

  it('does not include already-completed pairs in gaps', () => {
    const completed = [{ testIndex: 2, model: 'modelA' }];
    const gaps = findGaps(completed, 3, ['modelA', 'modelB']);
    const hasCompleted = gaps.some(g => g.testIndex === 2 && g.model === 'modelA');
    expect(hasCompleted).toBe(false);
  });
});
