import type { EvalResult, ComparisonResult, AutoAgentConfig } from './types.js';

export function compareResults(
  before: EvalResult,
  after: EvalResult,
  config: AutoAgentConfig,
): ComparisonResult {
  const scoreDelta = after.compositeScore - before.compositeScore;

  // Per-model deltas
  const perModelDeltas: Record<string, number> = {};
  const allModels = new Set([
    ...Object.keys(before.modelScores),
    ...Object.keys(after.modelScores),
  ]);

  for (const model of allModels) {
    const beforeScore = before.modelScores[model] ?? 0;
    const afterScore = after.modelScores[model] ?? 0;
    perModelDeltas[model] = afterScore - beforeScore;
  }

  // Check for model-specific regression > 0.1
  const hasModelRegression = Object.values(perModelDeltas).some(delta => delta < -0.1);

  // Rule 1: Composite improved >= improvementThreshold → KEEP
  if (scoreDelta >= config.improvementThreshold && !hasModelRegression) {
    return {
      decision: 'keep',
      scoreDelta,
      beforeScore: before.compositeScore,
      afterScore: after.compositeScore,
      perModelDeltas,
      hasModelRegression: false,
      reason: `Composite score improved by ${(scoreDelta * 100).toFixed(1)}%`,
    };
  }

  // Rule 2: Any model regressed > 0.1 → REVERT (model-specific overfitting)
  if (hasModelRegression) {
    const regressedModels = Object.entries(perModelDeltas)
      .filter(([, d]) => d < -0.1)
      .map(([m, d]) => `${m} (${(d * 100).toFixed(1)}%)`)
      .join(', ');
    return {
      decision: 'revert',
      scoreDelta,
      beforeScore: before.compositeScore,
      afterScore: after.compositeScore,
      perModelDeltas,
      hasModelRegression: true,
      reason: `Model regression detected: ${regressedModels}`,
    };
  }

  // Rule 3: Composite decreased → REVERT
  if (scoreDelta < 0) {
    return {
      decision: 'revert',
      scoreDelta,
      beforeScore: before.compositeScore,
      afterScore: after.compositeScore,
      perModelDeltas,
      hasModelRegression: false,
      reason: `Composite score decreased by ${(Math.abs(scoreDelta) * 100).toFixed(1)}%`,
    };
  }

  // Rule 4: Delta within noise (< improvementThreshold) → REVERT
  return {
    decision: 'revert',
    scoreDelta,
    beforeScore: before.compositeScore,
    afterScore: after.compositeScore,
    perModelDeltas,
    hasModelRegression: false,
    reason: `Score delta ${(scoreDelta * 100).toFixed(1)}% below improvement threshold ${(config.improvementThreshold * 100).toFixed(1)}%`,
  };
}
