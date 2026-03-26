import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const ragPipelineTemplate: TemplateConfig = {
  name: 'RAG Pipeline',
  type: 'rag-pipeline',
  description: 'Evaluate prompts for retrieval-augmented generation — answering questions grounded in provided context.',
  defaultAssertions: [
    {
      type: 'answer-relevance',
      threshold: 0.8,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Response cites source material and does not introduce unsupported claims',
      threshold: 0.8,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Response directly answers the question rather than restating context',
      threshold: 0.7,
    } as Assertion,
    {
      type: 'not-icontains',
      value: 'I cannot find',
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Answer question from retrieved context about company policy',
      vars: {
        query: 'How many vacation days do full-time employees receive?',
        context: `Employee Benefits Policy (v3.2, effective Jan 2024):
Full-time employees accrue 15 vacation days per year for their first three years of service.
After three years of continuous employment, this increases to 20 days per year.
Part-time employees receive pro-rated vacation based on their scheduled hours.
Unused vacation days may be carried over, up to a maximum of 10 days.`,
        sources: 'Employee Benefits Policy v3.2',
        expectedAnswer: '15 vacation days per year for the first three years',
      },
    } as TestCase,
    {
      description: 'Answer technical question from documentation context',
      vars: {
        query: 'What is the rate limit for the Search API endpoint?',
        context: `API Reference — Search Endpoint (GET /v2/search):
Rate limits: 100 requests per minute per API key. Requests exceeding this limit will receive
a 429 Too Many Requests response with a Retry-After header indicating wait time.
Enterprise tier customers receive a higher limit of 1,000 requests per minute.
Authentication: Bearer token required in Authorization header.
Response format: JSON with 'results', 'total', and 'page' fields.`,
        sources: 'API Reference Documentation',
      },
    } as TestCase,
  ],
  varsSchema: {
    query: {
      type: 'string',
      description: 'The question to answer using the retrieved context',
      required: true,
    },
    context: {
      type: 'string',
      description: 'The retrieved context documents to ground the answer',
      required: true,
    },
    sources: {
      type: 'string',
      description: 'Source attribution for the context (document names, URLs)',
      required: true,
    },
    expectedAnswer: {
      type: 'string',
      description: 'The expected answer for reference evaluation',
      required: false,
    },
  },
  programMdSnippet: `## RAG Pipeline-Specific Guidance
- Prioritize faithfulness: the response must only use information from the provided context
- When answer-relevance scores are low, make the prompt more directive about answering the specific question
- Ensure the prompt instructs the model to cite which source material supports each claim
- If hallucination markers appear, strengthen the instruction to refuse out-of-context answers
- Test edge cases: questions where the answer is partially in context, or not present at all`,
  requiredFeatures: ['answer-relevance', 'llm-rubric'],
};

export default ragPipelineTemplate;
