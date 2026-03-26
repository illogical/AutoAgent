import { buildCurlAssertions } from '../../src/assertions/index.js';
import type { TestCase } from 'promptfoo';

const BASE_URL = 'https://sourcemanager.example.internal';
const AUTH_HEADER = { 'X-DevServer-Token': /\S{16,}/ };

const testCases: TestCase[] = [
  {
    description: 'Trigger a project update via REST',
    vars: {
      userMessage: 'Update project "backend-api" (ID: proj-001) to pull the latest changes.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: `${BASE_URL}/v1/projects/proj-001/update`,
      requiredMethod: 'POST',
      requiredHeaders: AUTH_HEADER,
    }),
  },
  {
    description: 'Restart a project service',
    vars: {
      userMessage: 'Restart the "backend-api" project service (ID: proj-001).',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: `${BASE_URL}/v1/projects/proj-001/restart`,
      requiredMethod: 'POST',
      requiredHeaders: AUTH_HEADER,
      forbiddenFlags: ['--insecure', '-k'],
    }),
  },
  {
    description: 'Check project status',
    vars: {
      userMessage: 'What is the current status of project proj-001?',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: `${BASE_URL}/v1/projects/proj-001/status`,
      requiredMethod: 'GET',
      requiredHeaders: AUTH_HEADER,
    }),
  },
  {
    description: 'Deploy a specific branch',
    vars: {
      userMessage: 'Deploy the "feature/new-auth" branch of project proj-001.',
      apiBaseUrl: BASE_URL,
    },
    assert: buildCurlAssertions({
      requiredUrl: /\/v1\/projects\/proj-001\/deploy/,
      requiredMethod: 'POST',
      requiredHeaders: AUTH_HEADER,
      requiredBodyFields: ['branch'],
    }),
  },
];

export default testCases;
