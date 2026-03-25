import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const llmEvalJudgeTemplate: TemplateConfig = {
  name: 'LLM Eval Judge',
  type: 'llm-eval-judge',
  description: 'Evaluate prompts designed to act as LLM judges — scoring and reasoning about other LLM responses.',
  defaultAssertions: [
    {
      type: 'javascript',
      value: `
        const scoreMatch = output.match(/\\b([0-9]|10)\\b/);
        if (!scoreMatch) {
          return { pass: false, score: 0, reason: 'No numeric score (0-10) found in output' };
        }
        const score = parseInt(scoreMatch[1], 10);
        if (score < 0 || score > 10) {
          return { pass: false, score: 0, reason: \`Score \${score} out of range [0, 10]\` };
        }
        return { pass: true, score: 1, reason: \`Found valid score: \${score}\` };
      `,
    } as Assertion,
    {
      type: 'javascript',
      value: `
        const reasoningLength = output.replace(/\\d+\\/10|score:\\s*\\d+/gi, '').trim().length;
        if (reasoningLength < 50) {
          return { pass: false, score: 0.3, reason: \`Reasoning too brief: \${reasoningLength} chars (min 50)\` };
        }
        return { pass: true, score: 1, reason: \`Reasoning has adequate length: \${reasoningLength} chars\` };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Evaluation is well-reasoned, citing specific aspects of the judged response',
      threshold: 0.7,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Judge a coding explanation response',
      vars: {
        responseToJudge:
          'A linked list is a data structure made of nodes. Each node has data and a pointer to the next node. It allows O(1) insertions at the head.',
        judgingCriteria:
          'Accuracy of technical content, clarity of explanation, completeness for a beginner audience',
        expectedScoreRange: '6-9',
      },
    } as TestCase,
    {
      description: 'Judge a customer service response',
      vars: {
        responseToJudge:
          'Thank you for reaching out. I apologize for the inconvenience. Your refund request has been submitted and will be processed within 5-7 business days.',
        judgingCriteria:
          'Empathy, clarity of resolution timeline, professional tone, actionability',
      },
    } as TestCase,
  ],
  varsSchema: {
    responseToJudge: {
      type: 'string',
      description: 'The LLM response to be evaluated',
      required: true,
    },
    judgingCriteria: {
      type: 'string',
      description: 'The criteria to use when judging the response',
      required: true,
    },
    expectedScoreRange: {
      type: 'string',
      description: 'Expected score range (e.g., "7-9") for calibration reference',
      required: false,
    },
  },
  programMdSnippet: `## LLM Judge-Specific Guidance
- The judge prompt must produce a numeric score (0-10) and written reasoning
- Format guidance: "Score: X/10\\n\\nReasoning: ..."
- When score detection fails, make the output format more explicit and structured
- Calibrate the rubric against known-quality responses to establish score anchors
- Ensure the judge references specific phrases or aspects from the response being judged`,
  requiredFeatures: ['javascript', 'llm-rubric'],
};

export default llmEvalJudgeTemplate;
