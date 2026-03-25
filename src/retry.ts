import type { AutoAgentConfig, EvalResult } from './types.js';
import { evaluatePrompt } from './evaluate.js';
import { loadPartialResults, findGaps } from './results-store.js';

/**
 * Determine if an error represents an infrastructure failure (transient) vs a logic failure (permanent).
 */
export function isInfraFailure(result: unknown): boolean {
  if (!result) return false;

  const message = (() => {
    if (result instanceof Error) return result.message;
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      const r = result as Record<string, unknown>;
      return (
        (typeof r['message'] === 'string' ? r['message'] : '') +
        ' ' +
        (typeof r['error'] === 'string' ? r['error'] : '') +
        ' ' +
        (typeof r['reason'] === 'string' ? r['reason'] : '')
      );
    }
    return '';
  })().toLowerCase();

  const infraPatterns = [
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'enotfound',
    'socket hang up',
    'network error',
    '500',
    '502',
    '503',
    '504',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    // Ollama-specific errors
    'ollama',
    'model not found',
    'context length exceeded',
    'cuda out of memory',
    'out of memory',
  ];

  return infraPatterns.some(pattern => message.includes(pattern));
}

/**
 * Run evaluation with per-evaluation retry for infrastructure failures.
 */
export async function evaluateWithRetry(
  systemPrompt: string,
  config: AutoAgentConfig,
  customTests?: unknown[],
): Promise<EvalResult> {
  const maxRetries = config.retryConfig?.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await evaluatePrompt(systemPrompt, config, customTests);
    } catch (err) {
      lastError = err;
      const isInfra = isInfraFailure(err);
      const isLastAttempt = attempt === maxRetries;

      if (!isInfra || isLastAttempt) {
        throw err;
      }

      const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 30_000);
      console.warn(
        `  [retry] Infra failure on attempt ${attempt}/${maxRetries}: ${err instanceof Error ? err.message : String(err)}. Retrying in ${backoffMs}ms...`,
      );
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

/**
 * Resume an interrupted evaluation run by loading partial results and re-running only missing pairs.
 */
export async function gapFill(
  previousResultsPath: string,
  systemPrompt: string,
  config: AutoAgentConfig,
): Promise<EvalResult> {
  console.log(`[retry] Loading partial results from: ${previousResultsPath}`);
  const { results: partialResults, completedPairs } = await loadPartialResults(previousResultsPath);

  const totalTests = partialResults.testCaseResults?.length ?? 0;
  const gaps = findGaps(completedPairs, totalTests, config.targetModels);

  if (gaps.length === 0) {
    console.log('[retry] No gaps found — all test/model pairs already completed.');
    return partialResults as EvalResult;
  }

  console.log(`[retry] Found ${gaps.length} missing pairs. Running gap-fill evaluation...`);

  // Run a fresh full evaluation for the gap-fill (promptfoo doesn't support partial runs natively)
  const freshResult = await evaluateWithRetry(systemPrompt, config);

  // Merge: use fresh results but layer in completed pairs where available
  const mergedTestCaseResults = freshResult.testCaseResults.map((tc, idx) => {
    const wasCompleted = completedPairs.some(p => p.testIndex === idx);
    if (wasCompleted && partialResults.testCaseResults?.[idx]) {
      return partialResults.testCaseResults[idx];
    }
    return tc;
  });

  const mergedModelScores: Record<string, number> = { ...freshResult.modelScores };

  const modelAvgs = Object.values(mergedModelScores);
  const compositeScore =
    modelAvgs.length > 0 ? modelAvgs.reduce((a, b) => a + b, 0) / modelAvgs.length : 0;

  return {
    compositeScore,
    modelScores: mergedModelScores,
    testCaseResults: mergedTestCaseResults,
    rawSummary: freshResult.rawSummary,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
