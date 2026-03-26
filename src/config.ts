import { z } from 'zod';
import type { AutoAgentConfig } from './types.js';
import { readFileSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const AutoAgentConfigSchema = z.object({
  targetPromptPath: z.string().default('./prompts/target.md'),
  programPath: z.string().default('./program.md'),
  mutationModel: z.string().default('qwen3:32b'),
  ollamaBaseUrl: z.string().default('http://localhost:11434'),
  targetModels: z.array(z.string()).default(['qwen3:8b']),
  judgeModel: z.string().default('qwen3:32b'),
  maxIterations: z.number().int().positive().default(20),
  targetScoreDelta: z.number().positive().default(0.3),
  plateauThreshold: z.number().int().positive().default(5),
  evalTemperature: z.number().min(0).max(2).default(0.3),
  mutationTemperature: z.number().min(0).max(2).default(0.8),
  judgeTemperature: z.number().min(0).max(2).default(0.2),
  improvementThreshold: z.number().min(0).default(0.02),
  gitEnabled: z.boolean().default(true),
  autoCommit: z.boolean().default(true),
  autoRevert: z.boolean().default(false),
  maxConcurrency: z.number().int().positive().default(2),
  writeLatestResults: z.boolean().default(true),
  templateType: z.enum([
    'summarization',
    'categorization',
    'tagging',
    'rag-pipeline',
    'llm-eval-judge',
    'repeatable-experiments',
    'agent-swe',
  ]).optional(),
  retryConfig: z.object({
    maxRetries: z.number().int().positive().default(3),
    retryableErrors: z.array(z.string()).default(['timeout', 'ECONNREFUSED', '500']),
    gapFillEnabled: z.boolean().default(false),
    partialResultsPath: z.string().optional(),
  }).optional(),
  evalConfigPath: z.string().optional(),
});

export const DEFAULT_CONFIG: AutoAgentConfig = {
  targetPromptPath: './prompts/target.md',
  programPath: './program.md',
  mutationModel: 'qwen3:32b',
  ollamaBaseUrl: 'http://localhost:11434',
  targetModels: ['qwen3:8b'],
  judgeModel: 'qwen3:32b',
  maxIterations: 20,
  targetScoreDelta: 0.3,
  plateauThreshold: 5,
  evalTemperature: 0.3,
  mutationTemperature: 0.8,
  judgeTemperature: 0.2,
  improvementThreshold: 0.02,
  gitEnabled: true,
  autoCommit: true,
  autoRevert: false,
  maxConcurrency: 2,
  writeLatestResults: true,
};

export async function loadConfig(configPath?: string): Promise<AutoAgentConfig> {
  let fileConfig: Partial<AutoAgentConfig> = {};

  const path = configPath ?? './auto-agent.config.ts';
  const resolvedPath = resolve(process.cwd(), path);

  if (existsSync(resolvedPath)) {
    try {
      const url = pathToFileURL(resolvedPath).href;
      const module = await import(url);
      fileConfig = module.default ?? module;
    } catch {
      // If we can't import the config file, try reading as JSON
      try {
        const raw = readFileSync(resolvedPath, 'utf-8');
        fileConfig = JSON.parse(raw);
      } catch {
        console.warn(`[AutoAgent] Could not load config from ${resolvedPath}, using defaults`);
      }
    }
  }

  const merged = { ...DEFAULT_CONFIG, ...fileConfig };
  const result = AutoAgentConfigSchema.parse(merged);
  return result as AutoAgentConfig;
}
