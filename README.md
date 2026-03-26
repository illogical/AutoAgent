# AutoAgent

An autonomous prompt refinement loop that iteratively improves prompts and agent skill instructions using local Ollama models, powered by Promptfoo's evaluation engine.

**Pattern**: mutate → evaluate → compare → keep or revert → repeat

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) pattern — AutoAgent applies the same iterative improvement principle to prompt engineering.

---

## Table of Contents

- [Purpose](#purpose)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Configuration Reference](#configuration-reference)
- [Template Types](#template-types)
- [Writing program.md](#writing-programmd)
- [Writing eval-config.ts](#writing-eval-configts)
- [Using the Examples](#using-the-examples)
- [Promptfoo Integration](#promptfoo-integration)
- [Project Structure](#project-structure)

---

## Purpose

AutoAgent solves the tedious manual loop of editing a prompt, running evals, checking scores, and deciding whether to keep the change. It automates this cycle using:

- **Ollama** as both the target model (what you're improving) and the mutation agent (what proposes changes)
- **Promptfoo** as the evaluation engine (runs assertions, computes scores, caches results)
- **Git** for automatic commit/revert based on score changes

You define what "good" looks like in `eval-config.ts` (test cases + assertions), and AutoAgent figures out how to get there.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AutoAgent Loop                           │
│                                                                 │
│  1. Read current prompt (target.md)                            │
│  2. Run baseline evaluation (Promptfoo + Ollama)               │
│  3. For each iteration:                                         │
│     a. Build eval feedback (scores, failures)                  │
│     b. Call mutation agent (Ollama) → revised prompt           │
│     c. Evaluate revised prompt (Promptfoo)                     │
│     d. Compare scores (keep if improved, revert if not)        │
│     e. Write prompt to file, optionally git commit             │
│     f. Check stop conditions (plateau, target delta, max iter) │
│  4. Write run history to history/                              │
└─────────────────────────────────────────────────────────────────┘
```

**Key modules:**
- `src/loop.ts` — Orchestrates the refinement loop
- `src/mutate.ts` — Calls Ollama to propose prompt mutations
- `src/evaluate.ts` — Wraps Promptfoo's `evaluate()` API
- `src/compare.ts` — Keep/revert decision logic with 4 rules
- `src/templates/` — Pre-built assertion bundles for common prompt types
- `src/assertions/` — MCP tool call and curl command assertion helpers
- `src/retry.ts` — Infrastructure failure retry and gap-fill recovery

---

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) or Node.js | ≥ 1.0 / ≥ 20 | Runtime |
| [Ollama](https://ollama.com) | Latest | Local LLM inference |
| Git | Any | Commit/revert on prompt changes |

Pull the models you want to use:
```bash
ollama pull qwen3:8b
ollama pull qwen3:32b
```

---

## Installation

```bash
git clone <repo-url>
cd AutoAgent
bun install
```

---

## Quick Start

1. **Write your target prompt** in `prompts/target.md`

2. **Define test cases** in `eval-config.ts`:
   ```typescript
   export default [
     {
       description: 'My test case',
       vars: { userMessage: 'What is 2+2?' },
       assert: [{ type: 'llm-rubric', value: 'Answers with the number 4', threshold: 0.8 }],
     },
   ];
   ```

3. **Configure the loop** in `auto-agent.config.ts`:
   ```typescript
   export default {
     targetPromptPath: 'prompts/target.md',
     programPath: 'program.md',
     mutationModel: 'qwen3:32b',
     targetModels: ['qwen3:8b'],
     judgeModel: 'qwen3:32b',
     maxIterations: 10,
   };
   ```

4. **Run AutoAgent**:
   ```bash
   bun run start
   # or
   bun run src/index.ts --iterations 10 --dry-run
   ```

5. **View results**:
   ```bash
   npx promptfoo view
   ```

---

## CLI Reference

| Flag | Type | Description |
|------|------|-------------|
| `--config <path>` | string | Path to config file (default: `./auto-agent.config.ts`) |
| `--iterations <n>` | number | Maximum number of iterations |
| `--model <name>` | string | Override target model (sets single model) |
| `--mutation-model <name>` | string | Override mutation agent model |
| `--judge-model <name>` | string | Override LLM judge model |
| `--template <type>` | string | Apply a prompt type template (see [Template Types](#template-types)) |
| `--dry-run` | flag | Propose mutations but do not write to disk |
| `--gap-fill <path>` | string | Resume from partial results file |
| `--retry <n>` | number | Max retries per evaluation on infra failures |
| `--view` | flag | Open `promptfoo view` after completion |

---

## Configuration Reference

All options in `auto-agent.config.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `targetPromptPath` | string | required | Path to the prompt file being refined |
| `programPath` | string | required | Path to `program.md` mutation instructions |
| `mutationModel` | string | required | Ollama model for proposing mutations |
| `ollamaBaseUrl` | string | `http://localhost:11434` | Ollama server URL |
| `targetModels` | string[] | required | Models to evaluate against |
| `judgeModel` | string | required | Model for `llm-rubric` assertions |
| `maxIterations` | number | `20` | Maximum loop iterations |
| `targetScoreDelta` | number | `0.3` | Stop when cumulative score gain reaches this |
| `plateauThreshold` | number | `5` | Stop after N consecutive no-improvement iterations |
| `evalTemperature` | number | `0.3` | Temperature for target model evaluations |
| `mutationTemperature` | number | `0.8` | Temperature for mutation proposals |
| `judgeTemperature` | number | `0.2` | Temperature for judge model |
| `improvementThreshold` | number | `0.02` | Minimum score delta to count as "improved" |
| `gitEnabled` | boolean | `true` | Enable git integration |
| `autoCommit` | boolean | `true` | Commit on improvement |
| `autoRevert` | boolean | `false` | Git revert on regression |
| `maxConcurrency` | number | `2` | Parallel Promptfoo evaluations |
| `writeLatestResults` | boolean | `true` | Write results for `promptfoo view` |
| `templateType` | TemplateType | — | Apply a pre-built template |
| `retryConfig` | RetryConfig | — | Retry/gap-fill configuration |
| `evalConfigPath` | string | — | Path to external eval config file |

**RetryConfig options:**
```typescript
retryConfig: {
  maxRetries: 3,           // Retries per evaluation on infra failure
  retryableErrors: [],     // Additional error patterns to retry
  gapFillEnabled: true,    // Enable gap-fill recovery
  partialResultsPath: './partial-results',
}
```

---

## Template Types

Templates provide pre-built assertion bundles for common prompt types. Use `--template <type>` or set `templateType` in config.

| Template | CLI value | Description |
|----------|-----------|-------------|
| Summarization | `summarization` | Word-count, ROUGE-N, llm-rubric for conciseness and factuality |
| Categorization | `categorization` | JavaScript label matching, llm-rubric for accuracy |
| Tagging | `tagging` | `is-json`, array validation, llm-rubric for coverage |
| RAG Pipeline | `rag-pipeline` | `answer-relevance`, citation and grounding rubrics, hallucination check |
| LLM Eval Judge | `llm-eval-judge` | Score detection (0-10), reasoning length, llm-rubric |
| Repeatable Experiments | `repeatable-experiments` | `similar` threshold, structural consistency, determinism rubric |
| Agent SWE | `agent-swe` | `contains-json`, tool name validation, workflow and code quality rubrics |

Templates merge their assertions into your test cases — your test case assertions run **after** template defaults.

```bash
# Use template via CLI
bun run src/index.ts --template summarization

# Or in config
export default { ..., templateType: 'rag-pipeline' };
```

---

## Writing program.md

`program.md` instructs the mutation agent on **how** to improve the prompt. It is read every iteration alongside the current eval feedback.

**Effective program.md structure:**
```markdown
## Goal
One sentence describing what the prompt should achieve.

## Current Failure Patterns
List the types of assertion failures to focus on.

## Mutation Strategies
Numbered list of specific changes to try for each failure type.

## Constraints
Hard rules the prompt must always satisfy (length, format, etc.).

## Success Criteria
What "done" looks like — specific assertion thresholds.
```

**Tips:**
- Be specific about output format requirements (JSON, word count, etc.)
- Map failure types to specific mutation strategies
- Include examples of what good and bad output looks like
- Keep program.md under 600 words — longer instructions dilute focus

See `examples/*/program.md` for concrete examples.

---

## Writing eval-config.ts

`eval-config.ts` defines your test cases. It must export an array of Promptfoo `TestCase` objects (or a default export).

```typescript
import type { TestCase } from 'promptfoo';

const tests: TestCase[] = [
  {
    description: 'Test case description',
    vars: { userMessage: 'Your input to the prompt' },
    assert: [
      { type: 'llm-rubric', value: 'Criteria for success', threshold: 0.7 },
      { type: 'contains', value: 'expected keyword' },
      { type: 'javascript', value: 'output.length > 10' },
    ],
  },
];

export default tests;
```

**Supported assertion types:** `llm-rubric`, `contains`, `icontains`, `not-icontains`, `is-json`, `contains-json`, `javascript`, `python`, `rouge-n`, `similar`, `answer-relevance`, `regex`, and [many more](https://promptfoo.dev/docs/configuration/expected-outputs/).

**Using assertion helpers:**
```typescript
import { buildMcpAssertions, buildCurlAssertions } from './src/assertions/index.js';

// Validate MCP tool calls
assert: buildMcpAssertions([{ toolName: 'create_card', requiredArgs: ['title', 'column'] }])

// Validate curl commands
assert: buildCurlAssertions({ requiredMethod: 'POST', requiredHeaders: { Authorization: /Bearer/ } })
```

---

## Using the Examples

Each `examples/` subdirectory is a self-contained use case:

```bash
# Run with a specific example
bun run src/index.ts \
  --config auto-agent.config.ts \
  # Point targetPromptPath to examples/summarization/target.md
  # Point programPath to examples/summarization/program.md
  # Load eval-config from examples/summarization/eval-config.ts
```

Or copy an example as your starting point:
```bash
cp examples/summarization/target.md prompts/target.md
cp examples/summarization/program.md program.md
cp examples/summarization/eval-config.ts eval-config.ts
```

**Available examples:**
| Example | Description |
|---------|-------------|
| `devplanner-mcp/` | MCP tool call agent for DevPlanner project boards |
| `devplanner-http/` | Same tasks via HTTP/curl for comparison |
| `sourcemanager-http/` | SourceManager REST API agent with auth headers |
| `summarization/` | Text summarization with ROUGE scoring |
| `rag-pipeline/` | RAG Q&A with citation and grounding assertions |

---

## Promptfoo Integration

AutoAgent uses Promptfoo's `evaluate()` API directly (not the CLI). Key integration points:

- **Providers**: Uses `ollama:chat:${model}` provider format
- **Judge model**: Set as `defaultTest.options.provider` for `llm-rubric` assertions
- **Caching**: Promptfoo caches results by default — repeated evaluations with identical inputs are instant
- **View**: Run `npx promptfoo view` to see evaluation results in a web UI
- **Custom assertions**: Use `javascript` type with self-contained code strings (no imports allowed in assertion strings)

---

## Project Structure

```
AutoAgent/
├── src/
│   ├── index.ts                   # CLI entry point (commander)
│   ├── loop.ts                    # Main refinement loop orchestrator
│   ├── mutate.ts                  # Mutation agent via Ollama
│   ├── evaluate.ts                # Promptfoo evaluation wrapper
│   ├── compare.ts                 # Keep/revert decision logic
│   ├── retry.ts                   # Retry and gap-fill for infra failures
│   ├── results-store.ts           # Partial results persistence
│   ├── history.ts                 # Run history tracking
│   ├── git.ts                     # Git commit/revert integration
│   ├── config.ts                  # Config loader with Zod validation
│   ├── types.ts                   # Shared TypeScript interfaces
│   ├── ollama.ts                  # Direct Ollama HTTP client
│   ├── assertions/
│   │   ├── index.ts               # Re-exports all assertion helpers
│   │   ├── mcp-tool-call.ts       # MCP tool call structural validation
│   │   └── curl-validation.ts     # Curl command / HTTP request validation
│   └── templates/
│       ├── index.ts               # Template registry and merge logic
│       ├── types.ts               # TemplateConfig interface
│       ├── summarization.ts
│       ├── categorization.ts
│       ├── tagging.ts
│       ├── rag-pipeline.ts
│       ├── llm-eval-judge.ts
│       ├── repeatable-experiments.ts
│       └── agent-swe.ts
├── examples/
│   ├── devplanner-mcp/            # MCP tool call agent example
│   ├── devplanner-http/           # HTTP curl agent example
│   ├── sourcemanager-http/        # REST API agent with auth
│   ├── summarization/             # Text summarization example
│   └── rag-pipeline/              # RAG Q&A example
├── prompts/
│   └── target.md                  # The prompt being refined
├── history/                       # Generated run logs (JSON)
├── partial-results/               # Crash recovery data
├── program.md                     # Mutation agent instructions
├── eval-config.ts                 # Your test cases
├── auto-agent.config.ts           # Loop configuration
├── package.json
├── tsconfig.json
└── bunfig.toml
```

