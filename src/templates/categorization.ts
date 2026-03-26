import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const categorizationTemplate: TemplateConfig = {
  name: 'Categorization',
  type: 'categorization',
  description: 'Evaluate prompts that classify text into one of several predefined categories.',
  defaultAssertions: [
    {
      type: 'javascript',
      value: `
        const validCategories = (vars.validCategories || '').split(',').map(c => c.trim().toLowerCase());
        if (validCategories.length === 0) return { pass: false, score: 0, reason: 'No valid categories defined in vars.validCategories' };
        const lowerOutput = output.toLowerCase().trim();
        const matched = validCategories.find(cat => lowerOutput.includes(cat));
        if (!matched) {
          return { pass: false, score: 0, reason: \`Output "\${output.slice(0,100)}" does not include any valid category: \${validCategories.join(', ')}\` };
        }
        return { pass: true, score: 1, reason: \`Category "\${matched}" found in output\` };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: "The selected category accurately reflects the content's primary topic",
      threshold: 0.8,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Categorize a sports news article',
      vars: {
        inputText:
          'The basketball team won their third championship in five years after a stunning overtime victory, with the star player scoring 42 points in the final game.',
        validCategories: 'Sports,Politics,Technology,Health,Entertainment,Science',
        expectedCategory: 'Sports',
      },
    } as TestCase,
    {
      description: 'Categorize a medical research article',
      vars: {
        inputText:
          'Researchers discovered a novel protein biomarker that predicts cardiovascular disease risk with 94% accuracy, potentially enabling earlier intervention before symptoms appear.',
        validCategories: 'Sports,Politics,Technology,Health,Science,Entertainment',
        expectedCategory: 'Health',
      },
    } as TestCase,
  ],
  varsSchema: {
    inputText: {
      type: 'string',
      description: 'The text to be categorized',
      required: true,
    },
    validCategories: {
      type: 'string',
      description: 'Comma-separated list of valid categories',
      required: true,
    },
    expectedCategory: {
      type: 'string',
      description: 'The expected category (for reference, not enforced)',
      required: false,
    },
  },
  programMdSnippet: `## Categorization-Specific Guidance
- Output should contain exactly one category from the provided list
- The category name must match one of the valid categories (case-insensitive)
- Avoid outputting explanations unless the prompt explicitly requests them
- When accuracy is low, focus on making the output format more deterministic
- Consider adding examples of edge cases that could belong to multiple categories`,
  requiredFeatures: ['javascript', 'llm-rubric'],
};

export default categorizationTemplate;
