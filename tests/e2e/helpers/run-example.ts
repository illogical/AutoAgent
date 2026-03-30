import { resolve } from 'path';
import { copyFileSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { runRefinementLoop } from '../../../src/loop.js';
import type { AutoAgentConfig, LoopSummary } from '../../../src/types.js';

const TEST_MODEL = process.env.TEST_MODEL ?? 'ministral-3:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

export interface ExampleRunOptions {
  exampleDir: string;
  configOverrides?: Partial<AutoAgentConfig>;
  preserveTempDir?: boolean;
}

export interface ExampleRunResult {
  summary: LoopSummary;
  tempDir: string;
  originalPrompt: string;
  finalPrompt: string;
  logPath: string | undefined;
}

export async function runExampleLoop(opts: ExampleRunOptions): Promise<ExampleRunResult> {
  const { exampleDir, configOverrides = {} } = opts;
  const absExampleDir = resolve(process.cwd(), exampleDir);

  // Copy target.md to a temp dir so the loop can mutate it without touching the fixture
  const tempDir = mkdtempSync(resolve(tmpdir(), 'autoagent-e2e-'));
  const tempTargetPath = resolve(tempDir, 'target.md');
  copyFileSync(resolve(absExampleDir, 'target.md'), tempTargetPath);

  const originalPrompt = readFileSync(tempTargetPath, 'utf-8');

  const config: AutoAgentConfig = {
    targetPromptPath: tempTargetPath,
    programPath: resolve(absExampleDir, 'program.md'),
    evalConfigPath: resolve(absExampleDir, 'eval-config.ts'),
    mutationModel: TEST_MODEL,
    targetModels: [TEST_MODEL],
    judgeModel: TEST_MODEL,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    maxIterations: 3,
    targetScoreDelta: 0.5,
    plateauThreshold: 3,
    improvementThreshold: 0.02,
    gitEnabled: false,
    autoCommit: false,
    autoRevert: false,
    maxConcurrency: 1,
    writeLatestResults: false,
    evalTemperature: 0.3,
    mutationTemperature: 0.8,
    judgeTemperature: 0.2,
    ...configOverrides,
  };

  let summary: LoopSummary;
  let logPath: string | undefined;
  try {
    summary = await runRefinementLoop(config, false);
    // getLogger() returns the logger initialized by the loop
    const { getLogger } = await import('../../../src/logger.js');
    logPath = getLogger().getLogPath();
  } finally {
    if (!opts.preserveTempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const finalPrompt = opts.preserveTempDir ? readFileSync(tempTargetPath, 'utf-8') : originalPrompt;

  return { summary: summary!, tempDir, originalPrompt, finalPrompt, logPath };
}
