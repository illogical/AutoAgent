import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const taggingTemplate: TemplateConfig = {
  name: 'Tagging',
  type: 'tagging',
  description: 'Evaluate prompts that extract relevant tags or keywords from text as a JSON array.',
  defaultAssertions: [
    {
      type: 'is-json',
    } as Assertion,
    {
      type: 'javascript',
      value: `
        if (!output.includes('[') || !output.includes(']')) {
          return { pass: false, score: 0, reason: 'Output does not contain a JSON array (missing [ or ])' };
        }
        let tags;
        try {
          tags = JSON.parse(output);
        } catch {
          const match = output.match(/\\[.*?\\]/s);
          if (!match) return { pass: false, score: 0, reason: 'Could not parse a JSON array from output' };
          try { tags = JSON.parse(match[0]); } catch { return { pass: false, score: 0, reason: 'Could not parse extracted array' }; }
        }
        if (!Array.isArray(tags)) return { pass: false, score: 0, reason: 'Parsed value is not an array' };
        if (tags.length === 0) return { pass: false, score: 0, reason: 'Tag array is empty' };
        const allStrings = tags.every(t => typeof t === 'string');
        if (!allStrings) return { pass: false, score: 0.5, reason: 'All tags should be strings' };
        return { pass: true, score: 1, reason: \`Valid tag array with \${tags.length} tags\` };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Tags comprehensively cover key topics without including irrelevant tags',
      threshold: 0.7,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Tag a machine learning article',
      vars: {
        inputText:
          'In this tutorial, we build a convolutional neural network in PyTorch to classify images from the CIFAR-10 dataset. We cover data augmentation, batch normalization, and learning rate scheduling techniques.',
        expectedTags: '["machine learning", "neural network", "PyTorch", "image classification", "deep learning"]',
      },
    } as TestCase,
    {
      description: 'Tag a recipe with allowed tags only',
      vars: {
        inputText:
          'This quick vegan pasta recipe uses whole-wheat spaghetti, cherry tomatoes, fresh basil, garlic, and olive oil. Ready in 20 minutes and under 400 calories.',
        allowedTags: 'vegan,vegetarian,pasta,quick-meals,healthy,Italian,gluten-free,low-calorie',
      },
    } as TestCase,
  ],
  varsSchema: {
    inputText: {
      type: 'string',
      description: 'The text to extract tags from',
      required: true,
    },
    allowedTags: {
      type: 'string',
      description: 'Comma-separated list of allowed tags to constrain output',
      required: false,
    },
    expectedTags: {
      type: 'string',
      description: 'JSON array string of expected tags for reference',
      required: false,
    },
  },
  programMdSnippet: `## Tagging-Specific Guidance
- Output must be a valid JSON array of strings, nothing else
- Tags should be lowercase, hyphenated for multi-word tags (e.g., "machine-learning")
- When is-json assertion fails, strengthen the output format instructions in the prompt
- Aim for 3-8 tags that capture the most important topics
- Avoid overly generic tags (e.g., "article", "text") that add no signal`,
  requiredFeatures: ['is-json', 'javascript'],
};

export default taggingTemplate;
