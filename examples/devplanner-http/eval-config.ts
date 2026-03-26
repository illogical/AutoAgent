import { buildCurlAssertions } from '../../src/assertions/index.js';
import type { TestCase } from 'promptfoo';

const BASE_URL = 'https://api.devplanner.example.com';

const testCases: TestCase[] = [
  {
    description: 'Create a card via HTTP POST',
    vars: {
      userMessage:
        'Create a card titled "Fix authentication timeout" in the "Backlog" column of the "q4-sprint" board.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: `${BASE_URL}/api/projects/q4-sprint/cards`,
      requiredMethod: 'POST',
      requiredHeaders: {
        'Content-Type': /application\/json/,
        Authorization: /Bearer\s+\S+/,
      },
      requiredBodyFields: ['title', 'column'],
    }),
  },
  {
    description: 'Move a card via HTTP PATCH',
    vars: {
      userMessage: 'Move card with ID "card-123" to the "In Review" column.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: /\/api\/projects\/.+\/cards\/.+\/move/,
      requiredMethod: 'PATCH',
      requiredHeaders: {
        'Content-Type': /application\/json/,
      },
      requiredBodyFields: ['target_column'],
    }),
  },
  {
    description: 'Get board overview via HTTP GET',
    vars: {
      userMessage: 'Show me the current state of the "q4-sprint" board.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: `${BASE_URL}/api/projects/q4-sprint/overview`,
      requiredMethod: 'GET',
      requiredHeaders: {
        Authorization: /Bearer\s+\S+/,
      },
    }),
  },
  {
    description: 'Toggle a subtask via HTTP PATCH',
    vars: {
      userMessage: 'Mark subtask "task-456" on card "card-123" as completed.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: /\/api\/projects\/.+\/cards\/.+\/tasks\/.+/,
      requiredMethod: 'PATCH',
      requiredBodyFields: ['completed'],
    }),
  },
];

export default testCases;
