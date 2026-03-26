import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { AutoAgentConfig, LoopSummary, IterationSummary, EvalResult } from './types.js';
import { evaluatePrompt, buildEvalFeedback } from './evaluate.js';
import { evaluateWithRetry } from './retry.js';
import { mutatePrompt, MutationParseError } from './mutate.js';
import { compareResults } from './compare.js';
import { gitCommit, isGitRepo } from './git.js';
import { writeRunHistory } from './history.js';

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

  console.log(`[AutoAgent] Starting refinement loop`);
  console.log(`  Target: ${config.targetPromptPath}`);
  console.log(`  Models: ${config.targetModels.join(', ')}`);
  console.log(`  Max iterations: ${config.maxIterations}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('');

  // Baseline evaluation
  console.log('[AutoAgent] Running baseline evaluation...');
  let baselineResult: EvalResult;
  const runEval = (prompt: string) =>
    config.retryConfig ? evaluateWithRetry(prompt, config) : evaluatePrompt(prompt, config);

  try {
    baselineResult = await runEval(currentPrompt);
    console.log(`  Baseline score: ${(baselineResult.compositeScore * 100).toFixed(1)}%`);
  } catch (err) {
    throw new Error(`Baseline evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let currentBaseline = baselineResult;

  for (let i = 1; i <= config.maxIterations; i++) {
    console.log(`\n[AutoAgent] Iteration ${i}/${config.maxIterations}`);

    const timestamp = new Date().toISOString();

    // a. Build eval feedback
    const evalFeedback = buildEvalFeedback(currentBaseline);

    // b. Mutate prompt
    let mutation;
    try {
      mutation = await mutatePrompt(
        currentPrompt,
        programMd,
        evalFeedback,
        history,
        config,
      );
      console.log(`  Proposed: ${mutation.changeSummary}`);
    } catch (err) {
      const errMsg = err instanceof MutationParseError
        ? `Parse error: ${err.message}`
        : `Mutation error: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  ⚠️  ${errMsg}`);
      history.push({ iteration: i, status: 'mutation_failed', error: errMsg, timestamp });
      continue;
    }

    // c. Evaluate mutated prompt
    let afterResult: EvalResult;
    try {
      afterResult = await runEval(mutation.revisedPrompt);
    } catch (err) {
      const errMsg = `Eval error: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  ❌ ${errMsg}`);
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
            console.warn(`  Git commit failed: ${err instanceof Error ? err.message : String(err)}`);
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
      console.log(`\n[AutoAgent] Target score delta reached (${(cumulativeDelta * 100).toFixed(1)}%)`);
      break;
    }
    if (consecutiveNoImprovement >= config.plateauThreshold) {
      stopReason = 'plateau';
      console.log(`\n[AutoAgent] Plateau detected (${consecutiveNoImprovement} consecutive no-improvement)`);
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
    console.log(`\n[AutoAgent] Run history saved to ${historyPath}`);
  }

  console.log('\n[AutoAgent] Summary:');
  console.log(`  Iterations: ${summary.totalIterations}`);
  console.log(`  Improvements: ${summary.improvementCount}`);
  console.log(`  Reverts: ${summary.revertCount}`);
  console.log(`  Failures: ${summary.failureCount}`);
  console.log(`  Baseline score: ${(summary.baselineScore * 100).toFixed(1)}%`);
  console.log(`  Final score: ${(summary.finalScore * 100).toFixed(1)}%`);
  console.log(`  Cumulative delta: ${(summary.cumulativeDelta * 100).toFixed(1)}%`);
  console.log(`  Stop reason: ${summary.stopReason}`);

  return summary;
}
