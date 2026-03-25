# AutoAgent — MVP Implementation Plan

> **Purpose**: An autonomous loop that iteratively refines prompts and agent skill instructions using local Ollama models, powered by Promptfoo's evaluation engine. Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch) pattern: mutate → evaluate → compare → keep or revert → repeat.

> **Companion docs**: [initial-implementation.md](initial-implementation.md) (detailed code examples for core modules), [brainstorm.md](prompts/brainstorm.md) (architectural exploration), [TASK.md](TASK.md) (phase-organized task tracker)

---

## 1. Project Structure

```
/Users/matt/Dev/AutoAgent/
├── src/
│   ├── index.ts                      # CLI entry point (commander)
│   ├── loop.ts                       # Main autoresearch loop orchestrator
│   ├── mutate.ts                     # Mutation agent — proposes prompt changes via Ollama
│   ├── evaluate.ts                   # Wraps promptfoo.evaluate(), extracts scores
│   ├── compare.ts                    # Score comparison, keep/revert decision logic
│   ├── history.ts                    # Iteration history tracking (JSON log)
│   ├── git.ts                        # Git integration for commit/revert (simple-git)
│   ├── config.ts                     # AutoAgentConfig type + Zod loader + defaults
│   ├── types.ts                      # Shared type definitions
│   ├── retry.ts                      # Per-test-case retry + gap-fill logic
│   ├── results-store.ts              # Partial results persistence for crash recovery
│   ├── ollama.ts                     # Direct Ollama HTTP client (for mutation agent)
│   ├── assertions/
│   │   ├── index.ts                  # Re-exports all assertion helpers
│   │   ├── mcp-tool-call.ts          # MCP tool call structural validation
│   │   └── curl-validation.ts        # Curl command / HTTP request validation
│   └── templates/
│       ├── index.ts                  # Template registry + loader + merge logic
│       ├── types.ts                  # TemplateConfig interface
│       ├── summarization.ts
│       ├── categorization.ts
│       ├── tagging.ts
│       ├── rag-pipeline.ts
│       ├── llm-eval-judge.ts
│       ├── repeatable-experiments.ts
│       └── agent-swe.ts
├── examples/                         # Concrete example configs using real APIs
│   ├── devplanner-mcp/               # Agent skill for DevPlanner via MCP
│   │   ├── eval-config.ts
│   │   ├── program.md
│   │   └── target.md
│   ├── devplanner-http/              # Same tasks via HTTP/curl for comparison
│   │   ├── eval-config.ts
│   │   ├── program.md
│   │   └── target.md
│   ├── sourcemanager-http/           # SourceManager REST API agent skill
│   │   ├── eval-config.ts
│   │   ├── program.md
│   │   └── target.md
│   ├── summarization/
│   │   ├── eval-config.ts
│   │   ├── program.md
│   │   └── target.md
│   └── rag-pipeline/
│       ├── eval-config.ts
│       ├── program.md
│       └── target.md
├── prompts/
│   └── target.md                     # The prompt being refined (user creates)
├── program.md                        # Meta-instructions for mutation agent
├── eval-config.ts                    # User's eval config (test cases, assertions)
├── auto-agent.config.ts              # Loop configuration
├── history/                          # Generated — iteration logs
├── partial-results/                  # Generated — crash recovery data
├── docs/
│   ├── initial-implementation.md     # Detailed code examples (reference)
│   ├── mvp-implementation-plan.md    # This file
│   ├── TASK.md                       # Phase-organized task tracker
│   ├── prompts/brainstorm.md
│   └── diagrams/
├── package.json
├── tsconfig.json
├── bunfig.toml
└── .gitignore
```

---

## 2. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `promptfoo` | `^0.100.0` | Eval engine — `evaluate()` API, assertions, caching, web viewer |
| `simple-git` | `^3.27.0` | Git operations for commit/revert on prompt changes |
| `commander` | `^12.0.0` | CLI argument parsing |
| `zod` | `^3.23.0` | Config validation and runtime type checking |
| `typescript` | `^5.6.0` | (devDep) Language |
| `@types/node` | `^22.0.0` | (devDep) Node type definitions |

---

## 3. Phase 1 — Core Loop

**Goal**: Get the mutate → evaluate → compare → keep/revert cycle working end-to-end as a runnable CLI tool.

**Promptfoo features**: `evaluate()` API, `ollama:chat:*` providers, `llm-rubric` with Ollama judge, `contains`/`icontains` deterministic assertions, `javascript` custom assertions, caching (enabled by default).

### 3.1 `src/types.ts` — Shared Type Definitions

```typescript
export interface AutoAgentConfig {
  targetPromptPath: string;
  programPath: string;
  mutationModel: string;               // e.g. "qwen3:32b"
  ollamaBaseUrl: string;               // default: "http://localhost:11434"
  targetModels: string[];              // e.g. ["qwen3:8b", "llama3.3:8b"]
  judgeModel: string;                  // e.g. "qwen3:32b"
  maxIterations: number;               // default: 20
  targetScoreDelta: number;            // stop if cumulative improvement >= this
  plateauThreshold: number;            // stop after N consecutive no-improvement
  evalTemperature: number;             // default: 0.3
  mutationTemperature: number;         // default: 0.8
  judgeTemperature: number;            // default: 0.2
  improvementThreshold: number;        // minimum delta to count as "improved"
  gitEnabled: boolean;                 // default: true
  autoCommit: boolean;
  autoRevert: boolean;
  maxConcurrency: number;              // default: 2
  writeLatestResults: boolean;         // for promptfoo view
  templateType?: TemplateType;         // Phase 2
  retryConfig?: RetryConfig;           // Phase 4
  evalConfigPath?: string;
}

export type TemplateType =
  | 'summarization'
  | 'categorization'
  | 'tagging'
  | 'rag-pipeline'
  | 'llm-eval-judge'
  | 'repeatable-experiments'
  | 'agent-swe';

export interface RetryConfig {
  maxRetries: number;                  // default: 3
  retryableErrors: string[];           // patterns: 'timeout', 'ECONNREFUSED', '500'
  gapFillEnabled: boolean;
  partialResultsPath?: string;
}

export interface EvalResult {
  compositeScore: number;
  modelScores: Record<string, number>;
  testCaseResults: TestCaseResult[];
  rawSummary: any;                     // Promptfoo EvaluateSummary
}

export interface TestCaseResult {
  description: string;
  passRate: number;
  avgScore: number;
  failures: FailureDetail[];
}

export interface FailureDetail {
  model: string;
  assertionType: string;
  reason: string;
  score: number;
}

export interface MutationResult {
  revisedPrompt: string;
  changeSummary: string;
  rationale: string;
}

export interface ComparisonResult {
  decision: 'keep' | 'revert';
  scoreDelta: number;
  beforeScore: number;
  afterScore: number;
  perModelDeltas: Record<string, number>;
  hasModelRegression: boolean;
  reason: string;
}

export interface IterationSummary {
  iteration: number;
  status: 'improved' | 'reverted' | 'mutation_failed' | 'eval_failed';
  changeSummary?: string;
  rationale?: string;
  beforeScore?: number;
  afterScore?: number;
  scoreDelta?: number;
  perModelDeltas?: Record<string, number>;
  error?: string;
  timestamp: string;
}

export interface LoopSummary {
  startTime: string;
  endTime: string;
  totalIterations: number;
  improvementCount: number;
  revertCount: number;
  failureCount: number;
  initialScore: number;
  finalScore: number;
  cumulativeDelta: number;
  iterations: IterationSummary[];
}

export interface EvalFeedback {
  compositeScore: number;
  failingTests: Array<{
    description: string;
    failures: FailureDetail[];
  }>;
  passingTests: string[];
}
```

Phase 1 uses all types except `TemplateType` and `RetryConfig` (reserved for later phases).

### 3.2 `src/config.ts` — Configuration Loader

- Define a Zod schema matching `AutoAgentConfig`
- Export `loadConfig(path?: string): AutoAgentConfig` — reads from `auto-agent.config.ts` (or path override)
- Export `DEFAULT_CONFIG` with sensible defaults:

```typescript
const DEFAULT_CONFIG: Partial<AutoAgentConfig> = {
  ollamaBaseUrl: 'http://localhost:11434',
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
```

- CLI flags from `commander` override config file values
- Validates at load time with Zod, throwing clear errors for invalid fields

### 3.3 `src/ollama.ts` — Direct Ollama HTTP Client

Thin HTTP client for calling Ollama directly (used by the mutation agent only — Promptfoo handles eval calls via its own provider).

```typescript
export async function callOllama(
  model: string,
  baseUrl: string,
  systemMessage: string,
  userMessage: string,
  temperature: number,
): Promise<string>
```

Implementation: `POST ${baseUrl}/api/chat` with `{ model, messages: [{role:'system', content: systemMessage}, {role:'user', content: userMessage}], stream: false, options: { temperature } }`. Parse `response.message.content`. Throw descriptive error on non-200 or connection failure. Use Bun's native `fetch`.

### 3.4 `src/evaluate.ts` — Promptfoo Evaluation Wrapper

Based on `initial-implementation.md` sections 3.2 and 3.5.

```typescript
export function buildEvalConfig(
  systemPrompt: string,
  targetModels: string[],
  judgeModel: string,
  evalTemperature: number,
  judgeTemperature: number,
  customTests?: TestCase[],
): TestSuiteConfiguration

export async function evaluatePrompt(
  systemPrompt: string,
  config: AutoAgentConfig,
): Promise<EvalResult>

export function extractEvalResult(summary: EvaluateSummary): EvalResult

export function buildEvalFeedback(result: EvalResult): EvalFeedback
```

**Key implementation details:**

- `buildEvalConfig()` constructs a `TestSuiteConfiguration` programmatically:
  - Uses `ollama:chat:${model}` provider format for each target model
  - Sets `defaultTest.options.provider` to `ollama:chat:${judgeModel}` for LLM-graded assertions
  - Accepts optional custom test cases (for template integration in Phase 2)
- `extractEvalResult()` converts Promptfoo's `EvaluateSummary` into `EvalResult`:
  - Promptfoo's `results` array has one element per (test case, provider) combination
  - Group by `result.provider.id` for per-model scores
  - Group by `result.testCase.description` for per-test-case results
  - Each result has `result.success`, `result.score`, `result.gradingResult.componentResults`
- **Single-eval-per-iteration optimization**: Only evaluate the "after" prompt each iteration. The "before" score is the cached baseline from the previous iteration. This halves Ollama calls per iteration.

### 3.5 `src/mutate.ts` — Mutation Agent

Based on `initial-implementation.md` sections 3.3 and 3.4.

```typescript
export async function mutatePrompt(
  currentPrompt: string,
  programMd: string,
  evalFeedback: EvalFeedback | null,
  iterationHistory: IterationSummary[],
  config: AutoAgentConfig,
): Promise<MutationResult>
```

Internal functions:
- `buildMutationSystemPrompt(programMd: string): string` — wraps program.md in the system message
- `buildMutationUserPrompt(currentPrompt, evalFeedback, iterationHistory): string` — constructs user message with current prompt, failure details, and what was already tried
- `parseMutationResponse(response: string): MutationResult` — multi-step JSON parse:
  1. Try `JSON.parse` directly
  2. Extract JSON from markdown code fences (`` ```json ... ``` ``)
  3. Find JSON object boundaries with regex `/{[\s\S]*}/`
  4. Throw `MutationParseError` if all fail

The mutation agent expects the JSON format `{ revisedPrompt, changeSummary, rationale }` as defined in `program.md` (see `initial-implementation.md` section 3.4 for the full template).

### 3.6 `src/compare.ts` — Comparison Logic

Direct implementation from `initial-implementation.md` section 3.6.

```typescript
export function compareResults(
  before: EvalResult,
  after: EvalResult,
  config: AutoAgentConfig,
): ComparisonResult
```

**Four decision rules:**
1. If composite score improved by >= `improvementThreshold` → **KEEP**
2. If composite score decreased → **REVERT**
3. If any individual model regressed by > 0.1 → **REVERT** (prevents model-specific overfitting, even if composite improved)
4. If delta is within noise range (< `improvementThreshold`) → **REVERT** (don't accumulate neutral changes)

### 3.7 `src/git.ts` — Git Integration

```typescript
import simpleGit from 'simple-git';

export async function gitCommit(
  filePath: string,
  message: string,
  repoPath?: string,
): Promise<void>

export async function gitRevert(
  filePath: string,
  repoPath?: string,
): Promise<void>

export async function isGitRepo(path?: string): Promise<boolean>
```

Stages the specific target file and commits. Message format: `feat(prompt): ${changeSummary} (+${delta}%)`. Only commits the target prompt file — history files, config changes, etc. go in `.gitignore`.

### 3.8 `src/history.ts` — Iteration History

```typescript
export async function writeRunHistory(summary: LoopSummary): Promise<string>
// Writes to history/run-{timestamp}.json, returns path

export async function loadRunHistory(path: string): Promise<LoopSummary>

export async function listRunHistories(historyDir?: string): Promise<string[]>
```

### 3.9 `src/loop.ts` — Main Refinement Loop

Based on `initial-implementation.md` section 3.7.

```typescript
export async function runRefinementLoop(config: AutoAgentConfig): Promise<LoopSummary>
```

The loop:
1. Read `target.md` and `program.md` from disk
2. Run baseline evaluation via `evaluatePrompt()`
3. For each iteration up to `maxIterations`:
   a. Build eval feedback from current baseline
   b. Call `mutatePrompt()` — catch and log errors, increment no-improvement counter
   c. Call `evaluatePrompt()` on the mutated prompt
   d. Call `compareResults()` to decide keep/revert
   e. On keep: write new prompt to disk, update baseline, reset no-improvement counter, git commit
   f. On revert: increment no-improvement counter
   g. Log iteration to history array
   h. Check stop conditions: cumulative delta reached, plateau detected
4. Write final `LoopSummary` to `history/run-{timestamp}.json`

### 3.10 `src/index.ts` — CLI Entry Point

Uses `commander` to parse:
- `--config <path>` — default: `./auto-agent.config.ts`
- `--iterations <n>` — overrides config
- `--model <name>` — sets single target model
- `--mutation-model <name>` — overrides config
- `--judge-model <name>` — overrides config
- `--template <type>` — (Phase 2) loads preset template
- `--dry-run` — proposes mutations but does not write
- `--gap-fill <path>` — (Phase 4) path to partial results
- `--retry <n>` — (Phase 4) max retries
- `--view` — runs `promptfoo view` after completion

Entry flow: parse args → load config → merge CLI overrides → validate → call `runRefinementLoop()` → print summary → optionally open `promptfoo view`.

### 3.11 Starter Files

- **`program.md`**: Use the template from `initial-implementation.md` section 3.4
- **`eval-config.ts`**: Export `getTestCases()` returning the 3 example test cases from `initial-implementation.md` section 3.2
- **`prompts/target.md`**: A sample system prompt (e.g., "You are a helpful coding assistant...")

### Phase 1 Verification

1. `bun run src/index.ts --iterations 3 --model qwen3:8b --mutation-model qwen3:32b --judge-model qwen3:32b`
2. Confirm: mutations proposed and logged, evals run against Promptfoo, scores reported, keep/revert decisions print clearly
3. Run `npx promptfoo view` to inspect results in web viewer
4. Verify Promptfoo caching works (re-running same prompt is instant)

---

## 4. Phase 2 — Prompt Type Templates

**Goal**: Ship 7 preset eval config templates that users select via `--template <type>` or `templateType` in config.

**Promptfoo features**: `llm-rubric`, `factuality`, `answer-relevance`, `is-json`, `contains-json`, `javascript`, `similar`, `rouge-n`, `word-count`, `not-icontains`.

### 4.1 `src/templates/types.ts` — Template Interface

```typescript
import type { Assertion, TestCase } from 'promptfoo';

export interface TemplateConfig {
  /** Human-readable template name */
  name: string;
  /** Template identifier matching TemplateType */
  type: TemplateType;
  /** Description of what this template evaluates */
  description: string;
  /** Default assertions applied to all test cases */
  defaultAssertions: Assertion[];
  /** Example test cases showing the expected vars structure */
  exampleTestCases: TestCase[];
  /** Default vars schema (for documentation) */
  varsSchema: Record<string, { type: string; description: string; required: boolean }>;
  /** Starter program.md snippet specific to this prompt type */
  programMdSnippet: string;
  /** Promptfoo features this template uses */
  requiredFeatures: string[];
}
```

### 4.2 `src/templates/index.ts` — Template Registry

```typescript
export function getTemplate(type: TemplateType): TemplateConfig
export function listTemplates(): TemplateConfig[]
export function mergeTemplateWithUserConfig(
  template: TemplateConfig,
  userTests: TestCase[],
  userAssertionOverrides?: Assertion[],
): TestCase[]
```

`mergeTemplateWithUserConfig()` combines template defaults with user customizations: user assertions are appended to (not replace) template defaults, and user test cases are used instead of examples if provided.

### 4.3 Template Assertion Strategies

**`summarization.ts`**:
- `javascript`: word count within configurable min/max
- `rouge-n`: coverage against reference summary (threshold: 0.4)
- `llm-rubric`: "The summary captures key points without introducing information not present in the original" (threshold: 0.7)
- `llm-rubric`: "The summary is concise and avoids redundant or filler phrases" (threshold: 0.7)
- `factuality`: validate against provided source facts
- Vars: `{ sourceText, referenceSummary?, keyFacts? }`
- Program.md: focus on compression ratio, information preservation, hallucination avoidance

**`categorization.ts`**:
- `javascript`: check output matches one of valid category labels (case-insensitive)
- `javascript`: mutual exclusivity check (single category) or multi-label format validation
- `llm-rubric`: "The selected category accurately reflects the content's primary topic" (threshold: 0.8)
- `contains-json` or `is-json`: if structured output expected
- Vars: `{ inputText, validCategories: string[], expectedCategory? }`
- Program.md: focus on clear decision boundaries, handling ambiguous inputs

**`tagging.ts`**:
- `is-json`: validate output is JSON array of tags
- `javascript`: check all tags match allowed tag set (if provided)
- `javascript`: check minimum number of tags extracted
- `llm-rubric`: "Tags comprehensively cover key topics without including irrelevant tags" (threshold: 0.7)
- Vars: `{ inputText, allowedTags?, expectedTags? }`
- Program.md: focus on tag relevance, completeness, format consistency

**`rag-pipeline.ts`**:
- `answer-relevance`: threshold 0.8 (built-in, checks output relevance to query)
- `factuality`: validate against provided context/sources
- `llm-rubric`: "Response cites source material and does not introduce unsupported claims" (threshold: 0.8)
- `llm-rubric`: "Response directly answers the question rather than restating context" (threshold: 0.7)
- `javascript`: check for source citation markers (e.g., `[1]`, `[Source:]`)
- `not-icontains`: hallucination detection via known-false statements
- Vars: `{ query, context, sources: string[], expectedAnswer? }`
- Program.md: focus on grounding, citation accuracy, hallucination resistance

**`llm-eval-judge.ts`**:
- `javascript`: check output contains numeric score within expected range
- `javascript`: check output includes reasoning/explanation (not just a score)
- `llm-rubric`: "Evaluation is well-reasoned, citing specific aspects of the judged response" (threshold: 0.7)
- `javascript`: consistency check — run same input twice and compare scores (deviation < threshold)
- Vars: `{ responseToJudge, judgingCriteria, expectedScoreRange? }`
- Program.md: focus on calibration, reasoning quality, consistency

**`repeatable-experiments.ts`**:
- `similar`: compare output to reference with high threshold (0.9+)
- `javascript`: determinism check — compute similarity across multiple runs at temperature 0
- `javascript`: structural consistency — output format identical across runs
- `llm-rubric`: "Response is factually consistent with previous runs on the same input" (threshold: 0.9)
- Vars: `{ experimentInput, referenceOutput?, requiredFormat? }`
- Program.md: focus on deterministic phrasing, structural templates, avoiding open-ended language

**`agent-swe.ts`**:
- `is-json` or `contains-json`: validate structured tool call output
- `javascript`: validate tool call has correct `name` field from allowed tools list
- `javascript`: validate tool call `arguments` match expected schema (uses MCP assertion helpers from Phase 3)
- `llm-rubric`: "Agent follows specified workflow steps in correct order" (threshold: 0.8)
- `llm-rubric`: "Code suggestions are syntactically valid and follow project conventions" (threshold: 0.7)
- `javascript`: check required fields in tool call output (e.g., `file_path`, `content`)
- Vars: `{ taskDescription, availableTools: string[], codeContext?, expectedToolSequence? }`
- Program.md: focus on tool selection accuracy, argument completeness, workflow adherence

Concrete examples for agent-swe: DevPlanner MCP tools (`create_card`, `move_card`, `toggle_task`) and SourceManager REST calls (`POST /v1/projects/:id/update`).

### 4.4 HTTP vs MCP Comparison Mode

A key use case is comparing the same agent task via MCP tool calls vs HTTP/curl calls. The eval config supports:

- **Paired test cases**: Same task with `vars.integrationMode: 'mcp' | 'http'`, each with mode-appropriate assertions
- **Side-by-side scoring**: Compare composite scores between MCP and HTTP variants for the same operation
- **Comparison report**: After a run, output which integration mode scored higher per test case and overall
- The `agent-swe` template accepts an optional `integrationMode` var that selects MCP or curl/HTTP assertions
- Example: "Create a card in DevPlanner" tested with MCP (`create_card` tool call) and HTTP (`POST /api/projects/:slug/cards` curl)

### 4.5 Integration Points

- Modify `buildEvalConfig()` in `evaluate.ts` to accept optional `templateType`; when present, load template via `getTemplate()` and merge assertions
- Add `--template <type>` CLI flag to `index.ts`
- Add `--init-template` flag to generate starter `eval-config.ts` and `program.md` for the selected template

### Phase 2 Verification

1. Run with each template type and template-appropriate test cases
2. Confirm: template assertions are included in eval output, `llm-rubric` uses Ollama judge
3. Test assertion override: user adds a custom assertion that coexists with template defaults
4. Test `--init-template` generates usable starter files

---

## 5. Phase 3 — MCP & Curl Assertions

**Goal**: Reusable assertion helper functions for validating MCP tool call structure and curl command syntax. Designed for extensibility toward future e2e agent loop testing.

**Promptfoo features**: `is-json`, `contains-json`, `javascript` custom assertions.

### 5.1 `src/assertions/mcp-tool-call.ts` — MCP Structural Validation

```typescript
export interface McpToolCallSchema {
  toolName: string;
  requiredArgs: string[];
  argTypes?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  optionalArgs?: string[];
}

/** Generate a self-contained JavaScript assertion string for Promptfoo */
export function mcpToolCallAssertion(schema: McpToolCallSchema): string

/** Generate Promptfoo Assertion[] objects for a set of expected tool calls */
export function buildMcpAssertions(schemas: McpToolCallSchema[]): Assertion[]

/** Structural validation class — MVP validates structure, future validates execution */
export class McpToolCallValidator {
  constructor(private schemas: McpToolCallSchema[]) {}
  validateStructure(output: string): GradingResult
  // Future: async validateExecution(output: string, mcpServerUrl: string): Promise<GradingResult>
}
```

**Critical constraint**: Assertion strings must be self-contained JavaScript — no external imports. Promptfoo evaluates `javascript` assertions in isolation.

The generated `mcpToolCallAssertion()` string validates:
1. Output parses as JSON (with fallback to extract from markdown code fences)
2. Has a tool/function name field (checks common patterns: `.name`, `.tool`, `.function.name`)
3. Name matches expected tool name
4. Has arguments/params object (checks `.arguments`, `.params`, `.input`)
5. All required argument fields are present
6. Argument types match schema (if `argTypes` provided)

**Example schemas for DevPlanner MCP tools:**

```typescript
const devPlannerSchemas: McpToolCallSchema[] = [
  {
    toolName: 'create_card',
    requiredArgs: ['projectSlug', 'title', 'lane'],
    argTypes: { projectSlug: 'string', title: 'string', lane: 'string' },
    optionalArgs: ['description', 'tags'],
  },
  {
    toolName: 'move_card',
    requiredArgs: ['projectSlug', 'cardSlug', 'targetLane'],
    argTypes: { projectSlug: 'string', cardSlug: 'string', targetLane: 'string' },
  },
  {
    toolName: 'toggle_task',
    requiredArgs: ['projectSlug', 'cardSlug', 'taskIndex'],
    argTypes: { projectSlug: 'string', cardSlug: 'string', taskIndex: 'number' },
  },
];
```

### 5.2 `src/assertions/curl-validation.ts` — Curl & HTTP Validation

**Pattern A: Text output (agent generates curl command strings)**

```typescript
export interface CurlCommandSchema {
  requiredUrl?: string | RegExp;
  requiredMethod?: string;              // GET, POST, PUT, etc.
  requiredHeaders?: Record<string, string | RegExp>;
  requiredBodyFields?: string[];
  forbiddenFlags?: string[];            // e.g., ['--insecure', '-k']
}

export function curlCommandAssertion(schema: CurlCommandSchema): string
export function buildCurlAssertions(schema: CurlCommandSchema): Assertion[]
```

Generated JavaScript parses curl by:
1. Checking output contains `curl` (or extracting from code fences)
2. Extracting URL (first non-flag argument after `curl`)
3. Extracting method from `-X`/`--request` flag
4. Extracting headers from `-H`/`--header` flags
5. Extracting body from `-d`/`--data` flags, validating JSON if Content-Type is application/json
6. Checking all fields against schema

**Pattern B: Programmatic HTTP (agent makes fetch/axios calls)**

```typescript
export interface HttpRequestSchema {
  requiredUrl?: string | RegExp;
  requiredMethod?: string;
  requiredHeaders?: Record<string, string | RegExp>;
  requiredBodyFields?: string[];
}

export function httpRequestCodeAssertion(schema: HttpRequestSchema): string
```

Parses code output to find `fetch(...)` or `axios(...)` calls, extracts URL/method/headers/body via regex, validates against schema.

**Example schemas for SourceManager REST:**

```typescript
const sourceManagerSchemas: CurlCommandSchema[] = [
  {
    requiredUrl: /\/v1\/projects\/\w+\/update/,
    requiredMethod: 'POST',
    requiredHeaders: { 'X-DevServer-Token': /.+/ },
    requiredBodyFields: ['branch'],
  },
  {
    requiredUrl: /\/v1\/projects\/\w+\/restart/,
    requiredMethod: 'POST',
    requiredHeaders: { 'X-DevServer-Token': /.+/ },
  },
];
```

### 5.3 Integration

- Update `agent-swe.ts` template to import and use `buildMcpAssertions()` instead of hand-written JavaScript
- Update `rag-pipeline.ts` to optionally use `buildCurlAssertions()` for API-based RAG pipelines

### Phase 3 Verification

1. Create test case where target prompt generates a `read_file` MCP tool call. Run with `mcpToolCallAssertion()`. Confirm valid calls pass, invalid fail with descriptive reasons.
2. Create test case for curl command. Validate URL, headers, body.
3. Test edge cases: JSON in code fences, partial JSON, missing fields, wrong tool name.

---

## 6. Phase 4 — Retry & Gap-Fill

**Goal**: Retry individual test/model combinations that fail due to infrastructure errors. Resume crashed runs from partial results.

**Promptfoo features**: `evaluate()` with `maxConcurrency`, caching (avoids re-running successful cached calls — Promptfoo does NOT cache errors).

### 6.1 `src/retry.ts` — Retry Logic

```typescript
/** Classify whether failure is infra (retryable) or eval (not retryable) */
export function isInfraFailure(result: any): boolean

/** Run evaluation with per-test-case retry for infra failures */
export async function evaluateWithRetry(
  systemPrompt: string,
  config: AutoAgentConfig,
): Promise<EvalResult>

/** Load previous partial results and rerun only missing pairs */
export async function gapFill(
  previousResultsPath: string,
  systemPrompt: string,
  config: AutoAgentConfig,
): Promise<EvalResult>
```

**`isInfraFailure()` checks for**: timeout errors, `ECONNREFUSED`, HTTP 500/502/503, Ollama-specific errors (model loading, OOM), network errors. Returns `false` for assertion failures (which have `gradingResult` with scores).

**`evaluateWithRetry()` strategy**:
1. Run full `promptfoo.evaluate()` call
2. Inspect results for infra failures using `isInfraFailure()`
3. For each failed (test case, model) pair:
   a. Build a mini `TestSuiteConfiguration` with just that one test case and one provider
   b. Call `promptfoo.evaluate()` again (up to `config.retryConfig.maxRetries` times)
   c. If retry succeeds, merge result back into full results
4. Save partial results after each retry round (for crash recovery)
5. Return merged final results

**`gapFill()` strategy**:
1. Load previous partial results from JSON file
2. Determine which (test case, model) combinations are missing or errored
3. Build `TestSuiteConfiguration` with only those combinations
4. Run `promptfoo.evaluate()` on the gap set
5. Merge new results with previous
6. Save and return complete `EvalResult`

### 6.2 `src/results-store.ts` — Partial Results Persistence

```typescript
export async function savePartialResults(
  runId: string,
  results: Partial<EvalResult>,
  completedPairs: Array<{ testIndex: number; model: string }>,
): Promise<string>

export async function loadPartialResults(
  path: string,
): Promise<{ results: Partial<EvalResult>; completedPairs: Array<{ testIndex: number; model: string }> }>

export function findGaps(
  completedPairs: Array<{ testIndex: number; model: string }>,
  totalTests: number,
  models: string[],
): Array<{ testIndex: number; model: string }>
```

Storage at `partial-results/run-{timestamp}-partial.json`:
```json
{
  "runId": "...",
  "timestamp": "...",
  "systemPrompt": "...",
  "completedPairs": [...],
  "results": { ... },
  "config": { ... }
}
```

### 6.3 Integration

- Modify `loop.ts`: check config for `retryConfig` — if present, use `evaluateWithRetry()` instead of `evaluatePrompt()`
- After each evaluation, call `savePartialResults()` for crash recovery
- On startup, check for `--gap-fill <path>` — if present, load partial results and run only missing pairs
- Add CLI flags: `--retry <n>`, `--gap-fill <path>`, `--save-partial`

### Phase 4 Verification

1. Point one model to a non-existent Ollama endpoint. Run with `--retry 3`. Confirm: healthy model results retained, bad model retried 3 times, then reported as failed.
2. Kill a run mid-execution (Ctrl+C). Check `partial-results/` has a file. Run again with `--gap-fill <path>`. Confirm: only missing pairs evaluated, final results complete.
3. Confirm assertion failures (e.g., `llm-rubric` scored below threshold) are NOT retried.

---

## 7. Phase 5 — Example Configs

**Goal**: Ship concrete example configurations using real APIs (DevPlanner, SourceManager) to demonstrate templates, assertions, and the HTTP-vs-MCP comparison workflow.

Each example directory contains:
- `eval-config.ts` — test cases with assertions appropriate for the API/template
- `program.md` — mutation strategy tailored to the prompt type
- `target.md` — sample agent skill prompt

**`examples/devplanner-mcp/`**: Agent skill for managing DevPlanner via MCP tools. Test cases for `create_card`, `move_card`, `toggle_task`, `get_board_overview`. Uses `agent-swe` template with MCP assertions.

**`examples/devplanner-http/`**: Same DevPlanner tasks via HTTP/curl. Test cases for `POST /api/projects/:slug/cards`, `PATCH /api/projects/:slug/cards/:card/move`, etc. Uses `agent-swe` template with curl assertions. Enables direct comparison with the MCP variant.

**`examples/sourcemanager-http/`**: Agent skill for SourceManager REST API. Test cases for `POST /v1/projects/:id/update` (git pull + restart), `POST /v1/projects/:id/restart`, `GET /v1/projects/:id/status`. Uses curl assertions with `X-DevServer-Token` auth header validation.

**`examples/summarization/`**: Basic summarization prompt refinement. Uses `summarization` template with sample text and reference summaries.

**`examples/rag-pipeline/`**: RAG summarization over vector search results. Uses `rag-pipeline` template with sample queries, context documents, and citation assertions.

---

## 8. Key Architectural Decisions

1. **Promptfoo as library, not CLI**: All Promptfoo interactions go through the `evaluate()` JavaScript API. This gives programmatic control over config construction, result parsing, and retry/gap-fill logic.

2. **Templates as TypeScript, not YAML**: Templates are `.ts` files exporting `TemplateConfig` objects. Enables type safety, conditional assertion logic, and programmatic assertion generation (e.g., MCP assertion builder).

3. **Assertion helpers as string generators**: MCP and curl helpers generate self-contained JavaScript strings for Promptfoo's `javascript` assertion type. They cannot import external modules because Promptfoo evaluates them in isolation.

4. **Single eval per iteration**: Rather than evaluating both before and after (as in the initial doc), evaluate only the mutated prompt and compare against the cached baseline. Halves Ollama calls per iteration.

5. **Per-pair retry**: Retries run a mini `evaluate()` for just the failed (test, model) pair, not the entire test suite. Avoids wasting compute on already-passed tests.

6. **Partial results as first-class concept**: Every evaluation stores partial results. Enables crash recovery and the gap-fill workflow (e.g., one model's server crashes overnight, fill gaps the next morning).

7. **Git commits on target prompt only**: The git integration commits changes to `prompts/target.md` (or `targetPromptPath`). History files, config changes, and partial results go in `.gitignore`.

---

## 9. Promptfoo Feature Usage

| Feature | Phase | Usage |
|---------|-------|-------|
| `evaluate()` API | 1 | Core eval engine for all prompt testing |
| `ollama:chat:*` providers | 1 | Target models and judge model |
| `llm-rubric` | 1, 2 | Quality scoring with local Ollama judge |
| `contains` / `icontains` | 1, 2 | Deterministic string matching |
| `javascript` assertions | 1, 2, 3 | Custom validation (length, format, MCP, curl) |
| Caching | 1 | Avoid redundant LLM calls (enabled by default) |
| `writeLatestResults` | 1 | Enable `promptfoo view` for visual inspection |
| `factuality` | 2 | RAG pipeline source grounding |
| `answer-relevance` | 2 | RAG pipeline query relevance |
| `similar` (embeddings) | 2 | Repeatable experiments, output comparison |
| `rouge-n` | 2 | Summarization coverage scoring |
| `word-count` | 2 | Summarization length constraints |
| `is-json` / `contains-json` | 2, 3 | Structured output, MCP tool calls |
| `not-icontains` | 2 | Hallucination detection (negative assertions) |
| `select-best` | Future | Final prompt version comparison across iterations |
| Provider transforms | Future | Pre/post-processing of prompts/outputs |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Promptfoo `EvaluateSummary` shape changes across versions | Add version check in `evaluate.ts`, use defensive property access in `extractEvalResult()` |
| Ollama model loading latency (30-60s first call) | Log "warming up model..." on first call. Retry logic (Phase 4) handles timeouts gracefully |
| Mutation agent produces invalid JSON | Multi-step parse strategy: direct parse → code fence extraction → regex extraction. Log raw response on parse failure |
| JavaScript assertion string size limits | Keep generated JavaScript minimal. Test that Promptfoo handles assertion strings up to 5KB |
| Promptfoo caching interferes with retry | Promptfoo does NOT cache error responses — retries will hit Ollama fresh. Add code comment noting this |
| Template assertion conflicts with user overrides | Merge function appends user assertions after template defaults. Document that all assertions are evaluated independently |

---

## 11. Target API Reference

### DevPlanner (MCP + REST)

**MCP tools** (17 total): `list_projects`, `get_project`, `create_project`, `list_cards`, `get_card`, `create_card`, `update_card`, `move_card`, `add_task`, `toggle_task`, `get_board_overview`, `get_next_tasks`, `batch_update_tasks`, `search_cards`, `update_card_content`, `get_project_progress`, `archive_card`, `create_vault_artifact`

**REST endpoints**: `GET/POST /api/projects`, `GET/POST /api/projects/:slug/cards`, `PATCH /api/projects/:slug/cards/:card`, `PATCH /api/projects/:slug/cards/:card/move`, `POST /api/projects/:slug/cards/:card/tasks`, `PATCH /api/projects/:slug/cards/:card/tasks/:index`, card links, vault operations, git operations, search, analytics

**MCP resources**: `devplanner://projects`, `devplanner://projects/{slug}`, `devplanner://projects/{slug}/cards/{cardSlug}`

### SourceManager (REST-only)

**Auth**: `X-DevServer-Token` header on all `/v1/*` endpoints

**Endpoints**: `GET /v1/projects`, `GET /v1/projects/:id`, `GET /v1/projects/:id/status`, `GET /v1/projects/:id/process`, `GET /v1/projects/:id/logs`, `POST /v1/projects/:id/update` (body: `{ branch, installMode, restartMode, dryRun }`), `POST /v1/projects/:id/start`, `POST /v1/projects/:id/stop`, `POST /v1/projects/:id/restart`, `GET /v1/ports`
