import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const repeatableExperimentsTemplate: TemplateConfig = {
  name: 'Repeatable Experiments',
  type: 'repeatable-experiments',
  description: 'Evaluate prompts designed for experiments requiring consistent, reproducible outputs across runs.',
  defaultAssertions: [
    {
      type: 'javascript',
      value: `
        if (!output || output.trim().length === 0) {
          return { pass: false, score: 0, reason: 'Output is empty' };
        }
        // Check for structural consistency: output should not be pure freeform prose longer than 2000 chars
        // (indicates the model is rambling rather than following a structured format)
        if (output.trim().length > 2000 && !output.includes('\\n')) {
          return { pass: false, score: 0.5, reason: 'Output exceeds 2000 chars with no newlines — may lack structure' };
        }
        return { pass: true, score: 1, reason: 'Output has acceptable structure and length' };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Response is factually consistent and deterministic — same question would yield equivalent answer',
      threshold: 0.9,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Generate a structured JSON report from experiment data',
      vars: {
        experimentInput: 'Temperature: 23.4°C, Pressure: 1.013 atm, Sample: NaCl solution 0.1M, Conductivity: 12.3 mS/cm',
        referenceOutput:
          '{"temperature_c": 23.4, "pressure_atm": 1.013, "sample": "NaCl 0.1M", "conductivity_mscm": 12.3}',
        requiredFormat: 'JSON object with numeric fields temperature_c, pressure_atm, and conductivity_mscm',
      },
      assert: [
        {
          type: 'similar',
          value: '{{referenceOutput}}',
          threshold: 0.9,
        } as Assertion,
        {
          type: 'is-json',
        } as Assertion,
      ],
    } as TestCase,
    {
      description: 'Classify sentiment consistently across runs',
      vars: {
        experimentInput: 'The product arrived on time and exceeded my expectations. I would definitely recommend it.',
        requiredFormat: 'Single word: POSITIVE, NEGATIVE, or NEUTRAL',
      },
    } as TestCase,
  ],
  varsSchema: {
    experimentInput: {
      type: 'string',
      description: 'The input data for the experiment',
      required: true,
    },
    referenceOutput: {
      type: 'string',
      description: 'Reference output to compare against for similarity scoring',
      required: false,
    },
    requiredFormat: {
      type: 'string',
      description: 'Description of the required output format',
      required: false,
    },
  },
  programMdSnippet: `## Repeatable Experiments-Specific Guidance
- Optimize for low temperature and deterministic output format
- When similarity scores fall below 0.9, constrain the output format more explicitly
- Add explicit output format examples in the prompt (few-shot)
- Avoid instructions that allow creative latitude — prefer rigid format specifications
- Test with identical inputs across multiple runs to verify consistency`,
  requiredFeatures: ['similar', 'llm-rubric'],
};

export default repeatableExperimentsTemplate;
