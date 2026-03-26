import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateType } from '../types.js';
import type { TemplateConfig } from './types.js';
import summarizationTemplate from './summarization.js';
import categorizationTemplate from './categorization.js';
import taggingTemplate from './tagging.js';
import ragPipelineTemplate from './rag-pipeline.js';
import llmEvalJudgeTemplate from './llm-eval-judge.js';
import repeatableExperimentsTemplate from './repeatable-experiments.js';
import agentSweTemplate from './agent-swe.js';

const TEMPLATE_REGISTRY: Record<TemplateType, TemplateConfig> = {
  summarization: summarizationTemplate,
  categorization: categorizationTemplate,
  tagging: taggingTemplate,
  'rag-pipeline': ragPipelineTemplate,
  'llm-eval-judge': llmEvalJudgeTemplate,
  'repeatable-experiments': repeatableExperimentsTemplate,
  'agent-swe': agentSweTemplate,
};

export function getTemplate(type: TemplateType): TemplateConfig {
  const template = TEMPLATE_REGISTRY[type];
  if (!template) {
    throw new Error(
      `Unknown template type: "${type}". Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`,
    );
  }
  return template;
}

export function listTemplates(): TemplateConfig[] {
  return Object.values(TEMPLATE_REGISTRY);
}

/**
 * Merge a template's default assertions into user-provided test cases.
 * User assertions are appended after template defaults (not replaced).
 * If userTests is empty, returns the template's example test cases with merged assertions.
 */
export function mergeTemplateWithUserConfig(
  template: TemplateConfig,
  userTests: TestCase[],
  userAssertionOverrides?: Assertion[],
): TestCase[] {
  const additionalAssertions: Assertion[] = userAssertionOverrides ?? [];
  const baseAssertions: Assertion[] = [...template.defaultAssertions, ...additionalAssertions];

  // Use user tests if provided, otherwise fall back to the template's example test cases
  const sourceCases = userTests.length > 0 ? userTests : template.exampleTestCases;

  return sourceCases.map(tc => {
    const existingAssert: Assertion[] = Array.isArray(tc.assert) ? (tc.assert as Assertion[]) : [];
    return {
      ...tc,
      assert: [...baseAssertions, ...existingAssert],
    } as TestCase;
  });
}

export type { TemplateConfig } from './types.js';
