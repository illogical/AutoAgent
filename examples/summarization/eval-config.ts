import type { TestCase, Assertion } from 'promptfoo';
import { getTemplate, mergeTemplateWithUserConfig } from '../../src/templates/index.js';

const template = getTemplate('summarization');

const userTests: TestCase[] = [
  {
    description: 'Summarize a scientific abstract',
    vars: {
      sourceText: `Scientists at the European Space Agency have confirmed the detection of phosphine gas in the atmosphere
of Venus at an altitude of 53-61 km. Phosphine on Earth is produced only by industrial processes and by
anaerobic bacteria. The detection, made using the James Clerk Maxwell Telescope in Hawaii and the ALMA array
in Chile, suggests either a previously unknown chemical process or the presence of microbial life in the
Venusian clouds. The concentration measured was 20 parts per billion — far exceeding what known chemistry
can produce. Researchers have ruled out lightning, volcanic activity, and cosmic ray bombardment as sources.`,
      referenceSummary:
        'ESA detected phosphine in Venus\'s atmosphere at concentrations exceeding known non-biological production rates, suggesting either unknown chemistry or potential microbial life in the clouds.',
    },
    assert: [
      {
        type: 'rouge-n',
        value: '{{referenceSummary}}',
        threshold: 0.35,
      } as Assertion,
    ],
  },
  {
    description: 'Summarize a business report excerpt',
    vars: {
      sourceText: `Q3 2024 Financial Results: Revenue grew 23% year-over-year to $4.2 billion, driven primarily by
strong performance in the cloud services division (+47% YoY) and enterprise software subscriptions (+31% YoY).
Operating margin improved to 18.3% from 15.1% in Q3 2023. The company added 1,240 enterprise customers during
the quarter, bringing total enterprise customer count to 18,750. International revenue now represents 41% of
total revenue. Guidance for Q4 2024 projects revenue of $4.5-4.7 billion with operating margin of 19-20%.`,
      keyFacts: 'revenue growth 23%, cloud +47%, 1240 new enterprise customers, Q4 guidance $4.5-4.7B',
    },
  },
  {
    description: 'Summarize a news article about climate policy',
    vars: {
      sourceText: `The United Nations Climate Conference concluded with a landmark agreement requiring developed
nations to reduce carbon emissions by 45% below 2010 levels by 2035. The accord, signed by 187 countries,
also establishes a $300 billion annual climate fund to help developing nations transition to renewable energy.
Critics argue the targets fall short of what scientists say is necessary to limit warming to 1.5°C, while
industry groups warn of economic disruption. Implementation will be tracked through a new independent
monitoring body with annual reporting requirements.`,
    },
  },
];

export default mergeTemplateWithUserConfig(template, userTests);
