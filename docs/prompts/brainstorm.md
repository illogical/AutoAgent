
Take the following Git project into account and apply the same concepts to a TypeScript loop using Promptfoo.
https://github.com/karpathy/autoresearch/blob/master/README.md

The goal is to pair changes to a prompt with feedback on whether the changes improved the prompt responses. What we want to explore most is how to most effectively build an automatic prompt/agent skill refinement system based upon the autoresearch concepts for building an autonomous improvement system. We have local Ollama models available for running these types of experiments.

The goal is to create an automated loop that uses local Ollama models for Promptfoo to run evaluations for a "before" prompt and an "after" prompt and ability to determine if the change improved or reduced the accuracy/effectiveness of the prompt and also 2) test multiple different local models.

This is very similar to my long-term goal for my LMEval project: https://github.com/illogical/LMEval/blob/main/README.md

I want to take a step back to consider instead to maybe build a harness loop for promptfoo to accomplish the same goals with an autoresearch-like approach for refining prompts or maybe Promptfoo could be utilized by LMEval to provide its underlying capabilities. Explore these ideas with me to help me understand what might be involved for a new project for building a autoresearch-like promptfoo harness and explore if LMEval could morph into a frontend for Promptfoo.


Q: Which architectural direction interests you most?
A: I am thinking I want to start with Option A that may drive decisions toward Option B after I better understand how to utilize Promptfoo and I would better understand what is involved for an autoresearch-like loop. Those are the 2 main concepts that I want to better understand with this fresh POC project. Ideally use Typescript if Promptfoo supports it. Otherwise help me select the software dev stack that is most appropriate with the goal in mind that I may merge ideas with LMEval later.

Q: What would you want to explore next? (Select all that apply)
A: Detailed project scaffold + implementation plan, Deep dive on the mutation agent (program.md design), Promptfoo config examples for Ollama multi-model evals, I am also open the concept that this POC is for prompt and/or agent skill instruction refinement rather than for comparing which model is best given the scenario. Maybe longer-term, LMEval is just used for model comparisons and this eval harness will be used for the prompt instruction refinement.  I can still explore using Promptfoo multi-model evals for use with LMEval, but the current focus is working on an implementation plan for this Promptfoo autoresearch-like harness



---


## The core autoresearch pattern

Karpathy's autoresearch has a beautifully simple loop: **mutate → run for fixed time → measure single metric → keep or discard → repeat**. The key insight is that the "researcher" never touches the code directly — they write `program.md` (the meta-instructions), and the agent autonomously experiments with `train.py`. The entire feedback loop is automated with one clear metric: `val_bpb`.

For prompt/agent skill refinement, the analog is: **mutate the prompt → evaluate against test cases across models → score → keep or revert → repeat**. The metric shifts from `val_bpb` to a composite of deterministic checks + LLM-as-judge scores.

## Option A: New harness wrapping Promptfoo as the eval engine

This is a standalone TypeScript project that imports `promptfoo` as a library and wraps it in an autoresearch-style loop. Promptfoo's `evaluate()` function handles the heavy lifting of running prompts against providers and scoring with assertions.

**What the harness does that Promptfoo doesn't**: Promptfoo is a single-shot evaluator — you define a config, run it, get results. It doesn't have a built-in mutation → evaluate → compare → loop cycle. The harness would own the loop orchestration, the "mutation agent" (an LLM call that proposes prompt variants), the comparison logic (was the new prompt better?), and the keep/revert decision with git integration.

**Concretely, this looks like**:
```
loop.ts          — the autoresearch loop (max iterations, stop conditions)
mutate.ts        — calls an Ollama model to propose prompt changes  
evaluate.ts      — wraps promptfoo.evaluate() with your config
compare.ts       — compares EvaluateSummary results, decides keep/revert
config.ts        — which models, assertions, test cases
program.md       — meta-instructions for the mutation agent (Karpathy's insight)
```

The Promptfoo `evaluate()` call would use `ollama:chat:<model>` providers, with `llm-rubric` assertions for quality scoring and deterministic assertions (`contains`, `is-json`, `javascript`) for structural checks. You'd call `evaluate()` for the "before" prompt, then again for the "after" prompt, and compare the aggregate scores.

**Pros**: You get Promptfoo's mature assertion system, its Ollama provider, its caching, and its web viewer for free. The harness stays thin — maybe 500 lines of loop logic. Multi-model testing is trivial since Promptfoo already handles provider arrays natively. You can also pipe results to `promptfoo view` for visual inspection between iterations.

**Cons**: You're adding a dependency on a large project (that OpenAI just acquired — worth noting). Promptfoo's `EvaluateSummary` shape may not map cleanly to the composite scoring you've already designed in LMEval. You'd likely need adapter code to normalize Promptfoo's `GradingResult` into something your comparison logic can work with.

## Option B: LMEval morphs into a Promptfoo frontend

This would mean ripping out LMEval's `ExecutionService`, `MetricsService`, and `JudgeService` and replacing them with Promptfoo's `evaluate()` under the hood. LMEval's frontend (the wizard, heatmap, timeline, etc.) stays, but the backend delegates to Promptfoo for the actual eval runs.

**This is the most disruptive option and I'd argue against it.** Here's why:

Your `ExecutionService` already routes through LMApi with retry logic, server-specific targeting, and WebSocket progress events. Promptfoo's Ollama provider talks directly to Ollama, bypassing LMApi entirely — you'd lose your multi-server routing, your per-server model grouping, and the real-time cell events that drive your dashboard. You'd have to either fork Promptfoo's Ollama provider to talk to LMApi instead, or abandon LMApi for eval runs (which breaks your architecture).

Furthermore, LMEval's judge system is already more sophisticated than Promptfoo's `llm-rubric` for your use case — you have multi-perspective weighted scoring, pairwise comparison, and the 4-step JSON parse fallback. Replacing it with Promptfoo's grading would be a regression.

The one thing Promptfoo's assertion library gives you that LMEval currently lacks is the breadth of built-in assertion types (`similar` via embeddings, `factuality`, `answer-relevance`, `model-graded-closedqa`). These could be valuable but are better adopted selectively rather than wholesale.

## Option C: Standalone harness using LMApi + Ollama directly

Build the autoresearch loop from scratch in TypeScript, talking to your own LMApi for model calls, and using LMEval's existing eval APIs for scoring. No Promptfoo dependency.

**This aligns best with your ecosystem** but duplicates work that Promptfoo does well (assertion framework, caching, the web viewer).

## My recommendation: Option A with a bridge to LMEval

Build the harness as a new project that uses Promptfoo as the eval engine for the inner loop, but design it so the results can also be fed into LMEval for visualization and long-term tracking. The key architectural decision is: **Promptfoo owns the individual eval run, LMEval owns the session/history/regression layer.**

Here's what this looks like in practice:## What the harness project would look like

The new project (call it `prompt-refiner` or `auto-prompt` or whatever resonates) would be a small TypeScript CLI project with roughly this structure:

```
auto-prompt/
├── src/
│   ├── loop.ts              # Main autoresearch loop orchestrator
│   ├── mutate.ts            # LLM-based prompt mutation via Ollama
│   ├── evaluate.ts          # Wraps promptfoo.evaluate() for before/after
│   ├── compare.ts           # Score comparison, keep/revert decision
│   ├── bridge.ts            # Optional: sync results to LMEval API
│   ├── config.ts            # Loop config types + defaults
│   └── providers/
│       └── lmapi.ts         # Custom promptfoo provider routing through LMApi
├── prompts/
│   └── target.md            # The prompt being refined
├── program.md               # Meta-instructions for the mutation agent
├── promptfooconfig.yaml     # Base eval config (assertions, test cases)
├── package.json
└── tsconfig.json
```

The `program.md` file is where Karpathy's key insight translates: you don't directly tell the mutation agent what to change. You tell it *how to think about changes* — what the prompt is supposed to do, what failure modes look like, what kinds of changes to try. The mutation agent reads `program.md`, reads the current prompt, reads the latest eval results (especially failures), and proposes a modified prompt. This is essentially what your Phase 8a `RefinementService.buildImprovementPrompt()` already does — the harness just automates the iteration.

## How Promptfoo fits vs. what you'd build yourself

Here's the practical split of responsibilities:

**Promptfoo handles**: Running prompts against multiple Ollama models in parallel, assertion checking (`contains`, `is-json`, `llm-rubric`, `similar`, `javascript`), caching responses so re-evaluations of unchanged prompts are instant, and the web viewer for ad-hoc inspection via `promptfoo view`.

**Your harness handles**: The loop orchestration (iterations, stop conditions), the mutation agent (calling Ollama to propose prompt changes), the before/after comparison logic, git integration for keeping commits on improvement and reverting regressions, and optionally syncing results to LMEval's API for long-term visualization.

**Custom provider for LMApi**: Promptfoo supports custom JavaScript/TypeScript providers that implement an `id` method and a `callApi` method. You'd write a thin adapter that routes through LMApi instead of directly to Ollama, preserving your multi-server routing and server-specific model targeting. This way Promptfoo's eval engine uses your existing infrastructure.

## How LMEval could integrate without morphing

Rather than replacing LMEval's internals with Promptfoo, the bridge approach keeps both systems doing what they're best at. After each iteration of the loop, the harness would POST results to LMEval's existing endpoints: create a session version (`POST /api/eval/sessions/:id/versions`), record the eval run scores, and let LMEval's timeline, heatmap, and regression system visualize the refinement trajectory over time. LMEval becomes the "mission control dashboard" while the harness is the autonomous agent running overnight.

This also means your Phase 8b automated loop spec doesn't need to change — the harness *is* Phase 8b, just externalized as a separate project that talks to LMEval's API. The `RefinementLoopConfig` type, the stop conditions (max iterations, plateau detection, target score delta), and the WebSocket events you've already spec'd all apply directly.

## The multi-model angle

One thing that makes this more interesting than vanilla autoresearch: you're testing across multiple local models simultaneously. An improvement that helps `qwen3:32b` might hurt `llama3.3:70b`. The comparison logic needs to decide: optimize for best model? Average across models? Weighted by model capability? This is where your existing LMEval model leaderboard concept becomes valuable — the harness could use a weighted composite across the models you care about, with the weights informed by the leaderboard.

Before diving into implementation details, I want to make sure this direction resonates with what you're envisioning.



**Promptfoo is a perfect fit for the eval engine layer.** Its TypeScript `evaluate()` function takes a test suite config object and returns structured results — exactly what you need for the inner loop. Promptfoo exports an `evaluate` function that takes a `TestSuiteConfiguration` object and an `EvaluateOptions` object, returning results as an `EvaluateSummary`. The entire harness is native TypeScript with Bun as the runtime, matching your LMEval stack exactly.

**The `program.md` concept is the real unlock.** Just like Karpathy's insight that the human iterates on `program.md` while the agent iterates on `train.py`, your human effort goes into refining *how the mutation agent thinks about changes*, not into making the changes yourself. Over time, your `program.md` becomes a distilled artifact of your prompt engineering expertise.

**The key architectural insight for your ecosystem**: AutoPrompt is a *CLI tool that produces data*, while LMEval is a *web application that visualizes and manages data*. They connect through LMEval's existing REST API — the bridge in Phase 5 is just HTTP POSTs to endpoints you've already built. This means LMEval's Phase 8b automated loop could literally be "shell out to AutoPrompt and stream its WebSocket events."

**For Ollama + Promptfoo specifically**: You can configure Ollama providers with `ollama:chat:<model>` and pass configuration options like temperature and `num_predict` through the config key. For the LLM-as-judge assertions, you can override the default grader by setting the `provider` option on the assertion to use a local Ollama model instead of cloud models — so everything stays fully local.

The phased approach starts you with a working loop in Phase 1 (~500 lines of code) and builds from there. Phase 1 alone would give you a functional autoresearch-style prompt refiner. Want me to scaffold the actual Phase 1 code files so you have a runnable starting point?