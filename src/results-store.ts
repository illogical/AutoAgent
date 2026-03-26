import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AutoAgentConfig, EvalResult } from './types.js';

interface PartialResultsFile {
  runId: string;
  savedAt: string;
  systemPrompt: string;
  config: AutoAgentConfig;
  results: Partial<EvalResult>;
  completedPairs: Array<{ testIndex: number; model: string }>;
}

/**
 * Save partial evaluation results for crash recovery.
 * Returns the path of the saved file.
 */
export async function savePartialResults(
  runId: string,
  results: Partial<EvalResult>,
  completedPairs: Array<{ testIndex: number; model: string }>,
  systemPrompt: string,
  config: AutoAgentConfig,
): Promise<string> {
  const dir = join(process.cwd(), 'partial-results');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filePath = join(dir, `run-${runId}-partial.json`);
  const payload: PartialResultsFile = {
    runId,
    savedAt: new Date().toISOString(),
    systemPrompt,
    config,
    results,
    completedPairs,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return filePath;
}

/**
 * Load previously saved partial results from disk.
 */
export async function loadPartialResults(path: string): Promise<{
  results: Partial<EvalResult>;
  completedPairs: Array<{ testIndex: number; model: string }>;
  systemPrompt: string;
}> {
  if (!existsSync(path)) {
    throw new Error(`Partial results file not found: ${path}`);
  }

  const raw = readFileSync(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse partial results file: ${path}`);
  }

  const data = parsed as PartialResultsFile;
  return {
    results: data.results,
    completedPairs: data.completedPairs,
    systemPrompt: data.systemPrompt,
  };
}

/**
 * Compute which (testIndex, model) pairs have not yet been evaluated.
 */
export function findGaps(
  completedPairs: Array<{ testIndex: number; model: string }>,
  totalTests: number,
  models: string[],
): Array<{ testIndex: number; model: string }> {
  const completedSet = new Set(completedPairs.map(p => `${p.testIndex}::${p.model}`));
  const gaps: Array<{ testIndex: number; model: string }> = [];

  for (let testIndex = 0; testIndex < totalTests; testIndex++) {
    for (const model of models) {
      const key = `${testIndex}::${model}`;
      if (!completedSet.has(key)) {
        gaps.push({ testIndex, model });
      }
    }
  }

  return gaps;
}
