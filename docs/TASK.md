# AutoAgent — Task Tracker

## Phase 1: Core Loop

- [ ] Project scaffold: `bun init`, install deps (`promptfoo`, `simple-git`, `commander`, `zod`), tsconfig strict mode, .gitignore, bunfig.toml
- [ ] `src/types.ts` — shared interfaces (AutoAgentConfig, EvalResult, MutationResult, ComparisonResult, IterationSummary, LoopSummary, EvalFeedback)
- [ ] `src/config.ts` — Zod schema, default values, config file loader, CLI override merging
- [ ] `src/ollama.ts` — direct Ollama HTTP client for mutation agent (POST /api/chat)
- [ ] `src/evaluate.ts` — wrap promptfoo.evaluate(), buildEvalConfig(), extractEvalResult() from EvaluateSummary
- [ ] `src/mutate.ts` — mutation agent: buildMutationSystemPrompt(), buildMutationUserPrompt(), parseMutationResponse() with multi-step JSON fallback
- [ ] `src/compare.ts` — compareResults() with 4 decision rules (improvement/regression/model-regression/noise)
- [ ] `src/git.ts` — gitCommit() and gitRevert() via simple-git
- [ ] `src/history.ts` — writeRunHistory(), loadRunHistory(), listRunHistories()
- [ ] `src/loop.ts` — runRefinementLoop() orchestrator with stop conditions (max iterations, plateau, target delta)
- [ ] `src/index.ts` — CLI entry point via commander (--config, --iterations, --model, --mutation-model, --judge-model, --dry-run, --view)
- [ ] Starter files: program.md, eval-config.ts, prompts/target.md
- [ ] Verify: run 3 iterations end-to-end with single model, inspect via promptfoo view

## Phase 2: Prompt Type Templates

- [ ] `src/templates/types.ts` — TemplateConfig interface (name, type, defaultAssertions, exampleTestCases, varsSchema, programMdSnippet)
- [ ] `src/templates/index.ts` — template registry, getTemplate(), listTemplates(), mergeTemplateWithUserConfig()
- [ ] `src/templates/summarization.ts` — word-count, rouge-n, llm-rubric (conciseness, factuality)
- [ ] `src/templates/categorization.ts` — javascript (label matching, mutual exclusivity), llm-rubric
- [ ] `src/templates/tagging.ts` — is-json, javascript (tag set validation), llm-rubric (coverage)
- [ ] `src/templates/rag-pipeline.ts` — answer-relevance, factuality, llm-rubric (citation, grounding), not-icontains (hallucination)
- [ ] `src/templates/llm-eval-judge.ts` — javascript (score range, reasoning, consistency), llm-rubric
- [ ] `src/templates/repeatable-experiments.ts` — similar (high threshold), javascript (determinism), llm-rubric
- [ ] `src/templates/agent-swe.ts` — is-json, javascript (tool name, arg schema), llm-rubric (workflow, code quality)
- [ ] Integrate templates with evaluate.ts (buildEvalConfig accepts templateType)
- [ ] Add --template CLI flag to index.ts
- [ ] HTTP vs MCP comparison mode: paired test cases with integrationMode var, side-by-side scoring, comparison report
- [ ] Verify: run with each template type, confirm assertions fire and override merging works

## Phase 3: MCP & Curl Assertions

- [ ] `src/assertions/mcp-tool-call.ts` — McpToolCallSchema interface, mcpToolCallAssertion(), buildMcpAssertions(), McpToolCallValidator class
- [ ] `src/assertions/curl-validation.ts` — CurlCommandSchema, curlCommandAssertion(), HttpRequestSchema, httpRequestCodeAssertion()
- [ ] `src/assertions/index.ts` — re-exports
- [ ] Example MCP schemas for DevPlanner tools (create_card, move_card, toggle_task)
- [ ] Example curl schemas for SourceManager REST (POST /v1/projects/:id/update, restart)
- [ ] Update agent-swe template to use MCP assertion helpers
- [ ] Verify: test with valid/invalid MCP tool calls and curl commands

## Phase 4: Retry & Gap-Fill

- [ ] `src/retry.ts` — isInfraFailure(), evaluateWithRetry(), gapFill()
- [ ] `src/results-store.ts` — savePartialResults(), loadPartialResults(), findGaps()
- [ ] Integrate retry with loop.ts (use evaluateWithRetry when retryConfig present)
- [ ] Add --retry, --gap-fill, --save-partial CLI flags
- [ ] Verify: simulate infra failure, confirm per-test-case retry; kill mid-run, gap-fill from partial results

## Phase 5: Example Configs

- [ ] examples/devplanner-mcp/ — eval-config.ts, program.md, target.md
- [ ] examples/devplanner-http/ — same tasks via HTTP/curl for MCP comparison
- [ ] examples/sourcemanager-http/ — eval-config.ts, program.md, target.md
- [ ] examples/summarization/ — eval-config.ts, program.md, target.md
- [ ] examples/rag-pipeline/ — eval-config.ts, program.md, target.md
