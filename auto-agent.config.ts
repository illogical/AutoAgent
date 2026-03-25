import type { AutoAgentConfig } from './src/types.js';

const config: Partial<AutoAgentConfig> = {
  targetPromptPath: './prompts/target.md',
  programPath: './program.md',
  mutationModel: 'qwen3:32b',
  targetModels: ['qwen3:8b'],
  judgeModel: 'qwen3:32b',
  maxIterations: 20,
};

export default config;
