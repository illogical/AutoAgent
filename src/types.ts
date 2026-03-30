export interface AutoAgentConfig {
  targetPromptPath: string;
  programPath: string;
  mutationModel: string;
  ollamaBaseUrl: string;
  targetModels: string[];
  judgeModel: string;
  maxIterations: number;
  targetScoreDelta: number;
  plateauThreshold: number;
  evalTemperature: number;
  mutationTemperature: number;
  judgeTemperature: number;
  improvementThreshold: number;
  gitEnabled: boolean;
  autoCommit: boolean;
  autoRevert: boolean;
  maxConcurrency: number;
  writeLatestResults: boolean;
  templateType?: TemplateType;
  retryConfig?: RetryConfig;
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
  maxRetries: number;
  retryableErrors: string[];
  gapFillEnabled: boolean;
  partialResultsPath?: string;
}

export interface EvalResult {
  compositeScore: number;
  modelScores: Record<string, number>;
  testCaseResults: TestCaseResult[];
  rawSummary: unknown;
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
  timings?: {
    mutationMs: number;
    evalMs: number;
    totalMs: number;
  };
}

export interface LoopSummary {
  startTime: string;
  endTime: string;
  totalIterations: number;
  improvementCount: number;
  revertCount: number;
  failureCount: number;
  cumulativeDelta: number;
  finalScore: number;
  baselineScore: number;
  iterations: IterationSummary[];
  stopReason: string;
}

export interface EvalFeedback {
  compositeScore: number;
  modelScores: Record<string, number>;
  failingSummary: string;
  testCaseBreakdown: string;
}
