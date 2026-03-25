import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateType } from '../types.js';

export interface TemplateConfig {
  name: string;
  type: TemplateType;
  description: string;
  defaultAssertions: Assertion[];
  exampleTestCases: TestCase[];
  varsSchema: Record<string, { type: string; description: string; required: boolean }>;
  programMdSnippet: string;
  requiredFeatures: string[];
}
