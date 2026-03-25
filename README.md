# AutoAgent

An autonomous loop that iteratively refines prompts and agent skill instructions using local Ollama models, powered by Promptfoo's evaluation engine.

**Pattern**: mutate → evaluate → compare → keep or revert → repeat

## Requirements

- [Bun](https://bun.com) runtime
- [Ollama](https://ollama.com) running locally (`http://localhost:11434`)

## Install

```bash
bun install
```

## Usage

```bash
# Run with default config (auto-agent.config.ts)
bun run start

# CLI options
bun run src/index.ts --help
bun run src/index.ts --iterations 5 --model qwen3:8b
bun run src/index.ts --dry-run
```

## Configuration

Edit `auto-agent.config.ts` to set your models and paths. Edit `program.md` to guide the mutation agent. Edit `eval-config.ts` to define your test cases.

## Project structure

```
src/          TypeScript source modules
prompts/      Prompt files being refined
history/      Generated run logs (JSON)
program.md    Mutation agent instructions
eval-config.ts  Promptfoo test cases
auto-agent.config.ts  Loop configuration
```
