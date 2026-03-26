import type { Assertion, TestCase } from 'promptfoo';
import type { TemplateConfig } from './types.js';

const summarizationTemplate: TemplateConfig = {
  name: 'Summarization',
  type: 'summarization',
  description: 'Evaluate prompts that summarize long-form text into concise, accurate summaries.',
  defaultAssertions: [
    {
      type: 'javascript',
      value: `
        const words = output.split(/\\s+/).filter(w => w.length > 0);
        const count = words.length;
        if (count < 20) return { pass: false, score: 0, reason: \`Summary too short: \${count} words (min 20)\` };
        if (count > 150) return { pass: false, score: 0, reason: \`Summary too long: \${count} words (max 150)\` };
        return { pass: true, score: 1, reason: \`Word count \${count} within acceptable range [20, 150]\` };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'The summary captures key points without introducing information not present in the original',
      threshold: 0.7,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'The summary is concise and avoids redundant or filler phrases',
      threshold: 0.7,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Summarize a climate change article',
      vars: {
        sourceText: `Climate change refers to long-term shifts in temperatures and weather patterns.
These shifts may be natural, but since the 1800s, human activities have been the main driver of climate change,
primarily due to the burning of fossil fuels like coal, oil, and gas. Burning fossil fuels generates greenhouse
gas emissions that act like a blanket wrapped around the Earth, trapping the sun's heat and raising temperatures.
Examples of greenhouse gas emissions that are causing climate change include carbon dioxide and methane.
These come from using gasoline for driving a car or coal for heating a building, for example. Clearing land and
forests can also release carbon dioxide. Landfills for garbage are a major source of methane emissions.
Energy, industry, transport, buildings, agriculture and land use are among the main sectors causing greenhouse gases.`,
        referenceSummary:
          'Climate change is driven by human activities since the 1800s, primarily fossil fuel burning, which releases greenhouse gases that trap heat and raise Earth\'s temperatures.',
      },
      assert: [
        {
          type: 'rouge-n',
          value: '{{referenceSummary}}',
          threshold: 0.4,
        } as Assertion,
      ],
    } as TestCase,
    {
      description: 'Summarize a technical document without reference',
      vars: {
        sourceText: `A hash map (also called a hash table) is a data structure that implements an associative array,
also known as a dictionary. It uses a hash function to compute an index (also called a hash code) into
an array of buckets or slots, from which the desired value can be found. During lookup, the key is hashed
and the resulting hash indicates where the corresponding value is stored. In the case of hash collisions,
where two distinct keys produce the same hash value, most implementations use one of two strategies:
separate chaining, where each bucket contains a linked list of entries, or open addressing, where the
algorithm probes for an empty slot in the array.`,
      },
    } as TestCase,
  ],
  varsSchema: {
    sourceText: {
      type: 'string',
      description: 'The source text to be summarized',
      required: true,
    },
    referenceSummary: {
      type: 'string',
      description: 'An optional reference summary for ROUGE scoring',
      required: false,
    },
    keyFacts: {
      type: 'string',
      description: 'Optional list of key facts that should appear in the summary',
      required: false,
    },
  },
  programMdSnippet: `## Summarization-Specific Guidance
- Optimize for compression ratio: aim for 10-15% of source length
- Ensure all key entities (people, places, events) from the source are preserved
- Avoid copying sentences verbatim; paraphrase in concise language
- Do not introduce any information not present in the source text
- When ROUGE scores are low, focus on matching vocabulary and key phrases from the source`,
  requiredFeatures: ['llm-rubric', 'rouge-n'],
};

export default summarizationTemplate;
