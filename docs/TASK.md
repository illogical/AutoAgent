# AutoAgent — Task Tracker

## Phase 1: Core Loop

- [x] Project scaffold: `bun init`, install deps (`promptfoo`, `simple-git`, `commander`, `zod`), tsconfig strict mode, .gitignore, bunfig.toml
- [x] `src/types.ts` — shared interfaces (AutoAgentConfig, EvalResult, MutationResult, ComparisonResult, IterationSummary, LoopSummary, EvalFeedback)
- [x] `src/config.ts` — Zod schema, default values, config file loader, CLI override merging
- [x] `src/ollama.ts` — direct Ollama HTTP client for mutation agent (POST /api/chat)
- [x] `src/evaluate.ts` — wrap promptfoo.evaluate(), buildEvalConfig(), extractEvalResult() from EvaluateSummary
- [x] `src/mutate.ts` — mutation agent: buildMutationSystemPrompt(), buildMutationUserPrompt(), parseMutationResponse() with multi-step JSON fallback
- [x] `src/compare.ts` — compareResults() with 4 decision rules (improvement/regression/model-regression/noise)
- [x] `src/git.ts` — gitCommit() and gitRevert() via simple-git
- [x] `src/history.ts` — writeRunHistory(), loadRunHistory(), listRunHistories()
- [x] `src/loop.ts` — runRefinementLoop() orchestrator with stop conditions (max iterations, plateau, target delta)
- [x] `src/index.ts` — CLI entry point via commander (--config, --iterations, --model, --mutation-model, --judge-model, --dry-run, --view)
- [x] Starter files: program.md, eval-config.ts, prompts/target.md
- [ ] Verify: run 3 iterations end-to-end with single model, inspect via promptfoo view

## Phase 2: Prompt Type Templates

- [x] `src/templates/types.ts` — TemplateConfig interface (name, type, defaultAssertions, exampleTestCases, varsSchema, programMdSnippet)
- [x] `src/templates/index.ts` — template registry, getTemplate(), listTemplates(), mergeTemplateWithUserConfig()
- [x] `src/templates/summarization.ts` — word-count, rouge-n, llm-rubric (conciseness, factuality)
- [x] `src/templates/categorization.ts` — javascript (label matching, mutual exclusivity), llm-rubric
- [x] `src/templates/tagging.ts` — is-json, javascript (tag set validation), llm-rubric (coverage)
- [x] `src/templates/rag-pipeline.ts` — answer-relevance, factuality, llm-rubric (citation, grounding), not-icontains (hallucination)
- [x] `src/templates/llm-eval-judge.ts` — javascript (score range, reasoning, consistency), llm-rubric
- [x] `src/templates/repeatable-experiments.ts` — similar (high threshold), javascript (determinism), llm-rubric
- [x] `src/templates/agent-swe.ts` — is-json, javascript (tool name, arg schema), llm-rubric (workflow, code quality)
- [x] Integrate templates with evaluate.ts (buildEvalConfig accepts templateType)
- [x] Add --template CLI flag to index.ts
- [ ] HTTP vs MCP comparison mode: paired test cases with integrationMode var, side-by-side scoring, comparison report
- [ ] Verify: run with each template type, confirm assertions fire and override merging works

## Phase 3: MCP & Curl Assertions

- [x] `src/assertions/mcp-tool-call.ts` — McpToolCallSchema interface, mcpToolCallAssertion(), buildMcpAssertions(), McpToolCallValidator class
- [x] `src/assertions/curl-validation.ts` — CurlCommandSchema, curlCommandAssertion(), HttpRequestSchema, httpRequestCodeAssertion()
- [x] `src/assertions/index.ts` — re-exports
- [x] Example MCP schemas for DevPlanner tools (create_card, move_card, toggle_task)
- [x] Example curl schemas for SourceManager REST (POST /v1/projects/:id/update, restart)
- [x] Update agent-swe template to use MCP assertion helpers
- [ ] Verify: test with valid/invalid MCP tool calls and curl commands

## Phase 4: Retry & Gap-Fill

- [x] `src/retry.ts` — isInfraFailure(), evaluateWithRetry(), gapFill()
- [x] `src/results-store.ts` — savePartialResults(), loadPartialResults(), findGaps()
- [x] Integrate retry with loop.ts (use evaluateWithRetry when retryConfig present)
- [x] Add --retry, --gap-fill, --save-partial CLI flags
- [ ] Verify: simulate infra failure, confirm per-test-case retry; kill mid-run, gap-fill from partial results

## Phase 5: Example Configs

- [x] examples/devplanner-mcp/ — eval-config.ts, program.md, target.md
- [x] examples/devplanner-http/ — same tasks via HTTP/curl for MCP comparison
- [x] examples/sourcemanager-http/ — eval-config.ts, program.md, target.md
- [x] examples/summarization/ — eval-config.ts, program.md, target.md
- [x] examples/rag-pipeline/ — eval-config.ts, program.md, target.md
