import { callOllama } from './ollama.js';
import type { AutoAgentConfig, MutationResult, EvalFeedback, IterationSummary } from './types.js';

export class MutationParseError extends Error {
  constructor(message: string, public readonly rawResponse: string) {
    super(message);
    this.name = 'MutationParseError';
  }
}

function buildMutationSystemPrompt(programMd: string): string {
  return `${programMd}

## Critical output requirement
You MUST respond with ONLY a valid JSON object. No preamble, no explanation, no markdown fences outside the JSON. The JSON must have exactly these fields:
{
  "revisedPrompt": "the full updated prompt text",
  "changeSummary": "one-line description of what changed",
  "rationale": "why this change should help based on eval failures"
}`;
}

function buildMutationUserPrompt(
  currentPrompt: string,
  evalFeedback: EvalFeedback | null,
  iterationHistory: IterationSummary[],
): string {
  const historySection = iterationHistory.length > 0
    ? `\n## Previous attempts (do not repeat these)\n${iterationHistory
        .map(h => `- Iteration ${h.iteration}: ${h.changeSummary ?? 'unknown'} → ${h.status} (score: ${h.afterScore?.toFixed(3) ?? 'N/A'})`)
        .join('\n')}`
    : '';

  const feedbackSection = evalFeedback
    ? `\n## Current eval results
Composite score: ${evalFeedback.compositeScore.toFixed(3)}
Per-model scores: ${Object.entries(evalFeedback.modelScores).map(([m, s]) => `${m}=${s.toFixed(3)}`).join(', ')}

### Failures
${evalFeedback.failingSummary}

### Test case breakdown
${evalFeedback.testCaseBreakdown}`
    : '\n## No eval results yet (first iteration)';

  return `## Current prompt
\`\`\`
${currentPrompt}
\`\`\`
${feedbackSection}
${historySection}

Propose a single targeted improvement to the prompt. Respond with ONLY the JSON object.`;
}

function parseMutationResponse(raw: string): MutationResult {
  // Step 1: Direct JSON.parse
  try {
    const parsed = JSON.parse(raw.trim()) as MutationResult;
    if (parsed.revisedPrompt && parsed.changeSummary && parsed.rationale) {
      return parsed;
    }
  } catch {
    // continue
  }

  // Step 2: Extract from ```json ... ``` code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim()) as MutationResult;
      if (parsed.revisedPrompt && parsed.changeSummary && parsed.rationale) {
        return parsed;
      }
    } catch {
      // continue
    }
  }

  // Step 3: Find JSON with regex
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as MutationResult;
      if (parsed.revisedPrompt && parsed.changeSummary && parsed.rationale) {
        return parsed;
      }
    } catch {
      // continue
    }
  }

  throw new MutationParseError(
    `Could not parse mutation response as JSON. Raw response length: ${raw.length}`,
    raw,
  );
}

export async function mutatePrompt(
  currentPrompt: string,
  programMd: string,
  evalFeedback: EvalFeedback | null,
  iterationHistory: IterationSummary[],
  config: AutoAgentConfig,
): Promise<MutationResult> {
  const systemMessage = buildMutationSystemPrompt(programMd);
  const userMessage = buildMutationUserPrompt(currentPrompt, evalFeedback, iterationHistory);

  const response = await callOllama(
    config.mutationModel,
    config.ollamaBaseUrl,
    systemMessage,
    userMessage,
    config.mutationTemperature,
  );

  return parseMutationResponse(response);
}
