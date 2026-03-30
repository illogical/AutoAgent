import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import type { AutoAgentConfig, LoopSummary, IterationSummary, EvalResult } from './types.js';
import { evaluatePrompt, buildEvalFeedback } from './evaluate.js';
import { evaluateWithRetry } from './retry.js';
import { mutatePrompt, MutationParseError } from './mutate.js';
import { compareResults } from './compare.js';
import { gitCommit, isGitRepo } from './git.js';
import { writeRunHistory } from './history.js';
import { initLogger } from './logger.js';

function printIterationSummary(iter: IterationSummary): void {
  const scoreStr = iter.afterScore !== undefined
    ? ` | ${(iter.beforeScore! * 100).toFixed(1)}% → ${(iter.afterScore * 100).toFixed(1)}% (${iter.scoreDelta! >= 0 ? '+' : ''}${(iter.scoreDelta! * 100).toFixed(1)}%)`
    : '';
  const statusIcon = {
    improved: '✅',
    reverted: '↩️',
    mutation_failed: '⚠️',
    eval_failed: '❌',
  }[iter.status];

  console.log(`  ${statusIcon} [${iter.status}]${scoreStr}${iter.changeSummary ? ` — ${iter.changeSummary}` : ''}`);
  if (iter.error) console.log(`     Error: ${iter.error}`);
}

export async function runRefinementLoop(
  config: AutoAgentConfig,
  dryRun = false,
): Promise<LoopSummary> {
  const startTime = new Date().toISOString();
  const history: IterationSummary[] = [];
  let consecutiveNoImprovement = 0;
  let cumulativeDelta = 0;
  let stopReason = 'max_iterations';

  // Read target prompt and program.md
  const targetPromptPath = resolve(process.cwd(), config.targetPromptPath);
  const programPath = resolve(process.cwd(), config.programPath);

  if (!existsSync(targetPromptPath)) {
    throw new Error(`Target prompt not found: ${targetPromptPath}`);
  }
  if (!existsSync(programPath)) {
    throw new Error(`Program file not found: ${programPath}`);
  }

  let currentPrompt = readFileSync(targetPromptPath, 'utf-8');
  const programMd = readFileSync(programPath, 'utf-8');

  const gitEnabled = config.gitEnabled && await isGitRepo();

  // Initialize structured logger for this run
  const runId = startTime.replace(/[:.]/g, '-');
  const logger = initLogger(runId);

  // Load custom test cases if evalConfigPath is configured
  let customTests: unknown[] | undefined;
  if (config.evalConfigPath) {
    const evalConfigAbsPath = resolve(process.cwd(), config.evalConfigPath);
    const evalUrl = pathToFileURL(evalConfigAbsPath).href;
    const evalModule = await import(evalUrl);
    customTests = evalModule.default ?? evalModule.testCases;
    logger.info(`[AutoAgent] Loaded ${Array.isArray(customTests) ? customTests.length : '?'} test cases from ${config.evalConfigPath}`);
  }

  logger.info(`[AutoAgent] Starting refinement loop`);
  logger.info(`  Target: ${config.targetPromptPath}`);
  logger.info(`  Models: ${config.targetModels.join(', ')}`);
  logger.info(`  Max iterations: ${config.maxIterations}`);
  logger.info(`  Dry run: ${dryRun}`, { target: config.targetPromptPath, models: config.targetModels, maxIterations: config.maxIterations, dryRun });
  logger.info('');

  // Baseline evaluation
  logger.info('[AutoAgent] Running baseline evaluation...');
  let baselineResult: EvalResult;
  const runEval = (prompt: string) =>
    config.retryConfig ? evaluateWithRetry(prompt, config, customTests) : evaluatePrompt(prompt, config, customTests);

  let baselineMs: number;
  try {
    const baselineStart = performance.now();
    baselineResult = await runEval(currentPrompt);
    baselineMs = Math.round(performance.now() - baselineStart);
    logger.info(`  Baseline score: ${(baselineResult.compositeScore * 100).toFixed(1)}%`, { phase: 'baseline', score: baselineResult.compositeScore, durationMs: baselineMs });
  } catch (err) {
    throw new Error(`Baseline evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let currentBaseline = baselineResult;

  for (let i = 1; i <= config.maxIterations; i++) {
    logger.info(`\n[AutoAgent] Iteration ${i}/${config.maxIterations}`, { phase: 'iteration', iteration: i });

    const timestamp = new Date().toISOString();
    const iterStart = performance.now();

    // a. Build eval feedback
    const evalFeedback = buildEvalFeedback(currentBaseline);

    // b. Mutate prompt
    let mutation;
    let mutationMs: number;
    try {
      const mutStart = performance.now();
      mutation = await mutatePrompt(
        currentPrompt,
        programMd,
        evalFeedback,
        history,
        config,
      );
      mutationMs = Math.round(performance.now() - mutStart);
      logger.info(`  Proposed: ${mutation.changeSummary}`, { phase: 'mutation', iteration: i, changeSummary: mutation.changeSummary, durationMs: mutationMs });
    } catch (err) {
      const errMsg = err instanceof MutationParseError
        ? `Parse error: ${err.message}`
        : `Mutation error: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn(`  ⚠️  ${errMsg}`, { phase: 'mutation', iteration: i, error: errMsg });
      history.push({ iteration: i, status: 'mutation_failed', error: errMsg, timestamp });
      continue;
    }

    // c. Evaluate mutated prompt
    let afterResult: EvalResult;
    let evalMs: number;
    try {
      const evalStart = performance.now();
      afterResult = await runEval(mutation.revisedPrompt);
      evalMs = Math.round(performance.now() - evalStart);
      logger.debug(`  Eval complete`, { phase: 'eval', iteration: i, score: afterResult.compositeScore, durationMs: evalMs });
    } catch (err) {
      const errMsg = `Eval error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(`  ❌ ${errMsg}`, { phase: 'eval', iteration: i, error: errMsg });
      history.push({
        iteration: i,
        status: 'eval_failed',
        changeSummary: mutation.changeSummary,
        rationale: mutation.rationale,
        error: errMsg,
        timestamp,
      });
      continue;
    }

    // d. Compare results
    const comparison = compareResults(currentBaseline, afterResult, config);

    const totalMs = Math.round(performance.now() - iterStart);
    const iterSummary: IterationSummary = {
      iteration: i,
      status: comparison.decision === 'keep' ? 'improved' : 'reverted',
      changeSummary: mutation.changeSummary,
      rationale: mutation.rationale,
      beforeScore: comparison.beforeScore,
      afterScore: comparison.afterScore,
      scoreDelta: comparison.scoreDelta,
      perModelDeltas: comparison.perModelDeltas,
      timestamp,
      timings: { mutationMs, evalMs, totalMs },
    };

    // e/f. Keep or revert
    if (comparison.decision === 'keep') {
      if (!dryRun) {
        writeFileSync(targetPromptPath, mutation.revisedPrompt, 'utf-8');
        if (gitEnabled && config.autoCommit) {
          const commitMsg = `feat(prompt): ${mutation.changeSummary} (+${(comparison.scoreDelta * 100).toFixed(1)}%)\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`;
          try {
            await gitCommit(config.targetPromptPath, commitMsg);
          } catch (err) {
            logger.warn(`  Git commit failed: ${err instanceof Error ? err.message : String(err)}`, { phase: 'git', error: String(err) });
          }
        }
      }
      currentPrompt = mutation.revisedPrompt;
      currentBaseline = afterResult;
      cumulativeDelta += comparison.scoreDelta;
      consecutiveNoImprovement = 0;
    } else {
      consecutiveNoImprovement++;
    }

    // g. Log iteration
    history.push(iterSummary);
    printIterationSummary(iterSummary);

    // h. Check stop conditions
    if (cumulativeDelta >= config.targetScoreDelta) {
      stopReason = 'target_delta_reached';
      logger.info(`\n[AutoAgent] Target score delta reached (${(cumulativeDelta * 100).toFixed(1)}%)`, { stopReason, cumulativeDelta });
      break;
    }
    if (consecutiveNoImprovement >= config.plateauThreshold) {
      stopReason = 'plateau';
      logger.info(`\n[AutoAgent] Plateau detected (${consecutiveNoImprovement} consecutive no-improvement)`, { stopReason, consecutiveNoImprovement });
      break;
    }
  }

  const endTime = new Date().toISOString();
  const summary: LoopSummary = {
    startTime,
    endTime,
    totalIterations: history.length,
    improvementCount: history.filter(h => h.status === 'improved').length,
    revertCount: history.filter(h => h.status === 'reverted').length,
    failureCount: history.filter(h => h.status === 'mutation_failed' || h.status === 'eval_failed').length,
    cumulativeDelta,
    finalScore: currentBaseline.compositeScore,
    baselineScore: baselineResult.compositeScore,
    iterations: history,
    stopReason,
  };

  if (!dryRun) {
    const historyPath = await writeRunHistory(summary);
    logger.info(`\n[AutoAgent] Run history saved to ${historyPath}`, { historyPath });
  }

  logger.info('\n[AutoAgent] Summary:');
  logger.info(`  Iterations: ${summary.totalIterations}`);
  logger.info(`  Improvements: ${summary.improvementCount}`);
  logger.info(`  Reverts: ${summary.revertCount}`);
  logger.info(`  Failures: ${summary.failureCount}`);
  logger.info(`  Baseline score: ${(summary.baselineScore * 100).toFixed(1)}%`);
  logger.info(`  Final score: ${(summary.finalScore * 100).toFixed(1)}%`);
  logger.info(`  Cumulative delta: ${(summary.cumulativeDelta * 100).toFixed(1)}%`);
  logger.info(`  Stop reason: ${summary.stopReason}`, { phase: 'summary', ...summary });

  return summary;
}
