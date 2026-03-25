import type { AutoAgentConfig, EvalResult, EvalFeedback, TestCaseResult, FailureDetail } from './types.js';

// Dynamic import of promptfoo to handle API differences
async function getPromptfoo() {
  const pf = await import('promptfoo');
  return pf;
}

export function buildEvalConfig(
  systemPrompt: string,
  targetModels: string[],
  judgeModel: string,
  evalTemperature: number,
  judgeTemperature: number,
  customTests?: unknown[],
) {
  return {
    prompts: [
      {
        raw: JSON.stringify([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '{{userMessage}}' },
        ]),
        label: 'target-prompt',
      },
    ],
    providers: targetModels.map(model => ({
      id: `ollama:chat:${model}`,
      config: { temperature: evalTemperature },
    })),
    defaultTest: {
      options: {
        provider: {
          id: `ollama:chat:${judgeModel}`,
          config: { temperature: judgeTemperature },
        },
      },
    },
    tests: customTests ?? getDefaultTests(),
  };
}

function getDefaultTests() {
  return [
    {
      description: 'Basic capability check',
      vars: { userMessage: 'Explain how a hash map works in 3 sentences.' },
      assert: [
        {
          type: 'llm-rubric',
          value: 'Explains the key-to-index mapping mechanism clearly and concisely',
          threshold: 0.7,
        },
      ],
    },
  ];
}

export async function evaluatePrompt(
  systemPrompt: string,
  config: AutoAgentConfig,
  customTests?: unknown[],
): Promise<EvalResult> {
  const evalConfig = buildEvalConfig(
    systemPrompt,
    config.targetModels,
    config.judgeModel,
    config.evalTemperature,
    config.judgeTemperature,
    customTests,
  );

  const pf = await getPromptfoo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evaluate = (pf as any).evaluate ?? (pf as any).default?.evaluate;
  if (!evaluate) {
    throw new Error('Could not find evaluate function in promptfoo');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await evaluate(evalConfig as any, {
    maxConcurrency: config.maxConcurrency,
    showProgressBar: false,
  });

  return extractEvalResult(summary);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractEvalResult(summary: any): EvalResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = summary.results ?? [];

  const modelScores: Record<string, number[]> = {};
  const testCaseMap: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

  for (const result of results) {
    const providerId: string = result.provider?.id ?? result.providerId ?? 'unknown';
    const modelName = providerId.replace('ollama:chat:', '');
    const description: string = result.testCase?.description ?? result.vars?.userMessage ?? 'unknown';

    if (!modelScores[modelName]) modelScores[modelName] = [];
    if (!testCaseMap[description]) testCaseMap[description] = [];

    const score = typeof result.score === 'number' ? result.score : (result.success ? 1 : 0);
    modelScores[modelName].push(score);
    testCaseMap[description].push({ result, modelName, score });
  }

  // Compute per-model averages
  const avgModelScores: Record<string, number> = {};
  for (const [model, scores] of Object.entries(modelScores)) {
    avgModelScores[model] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  // Composite = average of model averages
  const modelAvgs = Object.values(avgModelScores);
  const compositeScore = modelAvgs.length > 0
    ? modelAvgs.reduce((a, b) => a + b, 0) / modelAvgs.length
    : 0;

  // Test case results
  const testCaseResults: TestCaseResult[] = Object.entries(testCaseMap).map(([description, entries]) => {
    const passed = entries.filter(e => e.result.success).length;
    const passRate = entries.length > 0 ? passed / entries.length : 0;
    const avgScore = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.score, 0) / entries.length
      : 0;

    const failures: FailureDetail[] = entries
      .filter(e => !e.result.success)
      .map(e => ({
        model: e.modelName,
        assertionType: e.result.gradingResult?.componentResults?.[0]?.assertion?.type ?? 'unknown',
        reason: e.result.gradingResult?.reason ?? e.result.error ?? 'Failed',
        score: e.score,
      }));

    return { description, passRate, avgScore, failures };
  });

  return {
    compositeScore,
    modelScores: avgModelScores,
    testCaseResults,
    rawSummary: summary,
  };
}

export function buildEvalFeedback(result: EvalResult): EvalFeedback {
  const failures = result.testCaseResults.flatMap(tc =>
    tc.failures.map(f => `  - [${tc.description}] model=${f.model} type=${f.assertionType}: ${f.reason}`)
  );

  const failingSummary = failures.length > 0
    ? `${failures.length} assertion(s) failed:\n${failures.join('\n')}`
    : 'All assertions passed.';

  const testCaseBreakdown = result.testCaseResults
    .map(tc => `  ${tc.description}: passRate=${(tc.passRate * 100).toFixed(0)}% avgScore=${tc.avgScore.toFixed(3)}`)
    .join('\n');

  return {
    compositeScore: result.compositeScore,
    modelScores: result.modelScores,
    failingSummary,
    testCaseBreakdown,
  };
}
