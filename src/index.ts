#!/usr/bin/env bun
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { runRefinementLoop } from './loop.js';
import type { AutoAgentConfig, TemplateType } from './types.js';

const program = new Command();

program
  .name('autoagent')
  .description('Autonomous prompt refinement loop using Ollama and Promptfoo')
  .version('0.1.0');

program
  .option('--config <path>', 'Path to config file', './auto-agent.config.ts')
  .option('--iterations <n>', 'Maximum number of iterations', parseInt)
  .option('--model <name>', 'Target model (sets single target model)')
  .option('--mutation-model <name>', 'Model used for proposing mutations')
  .option('--judge-model <name>', 'Model used for llm-rubric judging')
  .option('--template <type>', 'Prompt type template (Phase 2)')
  .option('--dry-run', 'Propose mutations but do not write them')
  .option('--gap-fill <path>', 'Resume from partial results (Phase 4)')
  .option('--retry <n>', 'Max retries per test case (Phase 4)', parseInt)
  .option('--view', 'Run promptfoo view after completion')
  .action(async (opts) => {
    try {
      // Load base config
      const config = await loadConfig(opts.config);

      // Apply CLI overrides
      const overrides: Partial<AutoAgentConfig> = {};
      if (opts.iterations !== undefined) overrides.maxIterations = opts.iterations;
      if (opts.model !== undefined) overrides.targetModels = [opts.model];
      if (opts.mutationModel !== undefined) overrides.mutationModel = opts.mutationModel;
      if (opts.judgeModel !== undefined) overrides.judgeModel = opts.judgeModel;
      if (opts.template !== undefined) overrides.templateType = opts.template as TemplateType;

      const finalConfig: AutoAgentConfig = { ...config, ...overrides };

      // Run the loop
      await runRefinementLoop(finalConfig, opts.dryRun ?? false);

      // Optionally open promptfoo view
      if (opts.view) {
        const { spawnSync } = await import('child_process');
        spawnSync('npx', ['promptfoo', 'view'], { stdio: 'inherit' });
      }
    } catch (err) {
      console.error('[AutoAgent] Fatal error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
