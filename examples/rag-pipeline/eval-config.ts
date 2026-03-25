import type { TestCase } from 'promptfoo';
import { getTemplate, mergeTemplateWithUserConfig } from '../../src/templates/index.js';

const template = getTemplate('rag-pipeline');

const userTests: TestCase[] = [
  {
    description: 'Answer a question from HR policy documentation',
    vars: {
      query: 'What is the company policy on remote work?',
      context: `Remote Work Policy (Updated March 2024):
Full-time employees may work remotely up to 3 days per week with manager approval.
Employees must be available during core hours of 10am-3pm in their local timezone.
A home office stipend of $500 per year is provided for equipment and internet costs.
Employees must be in-office for all-hands meetings (first Monday of each month).
Roles requiring physical presence (facilities, lab work) are exempt from this policy.`,
      sources: 'HR Remote Work Policy v4.2',
      expectedAnswer: 'Up to 3 days remote per week with manager approval, $500 annual stipend, in-office required first Monday monthly.',
    },
  },
  {
    description: 'Technical question answered from API documentation',
    vars: {
      query: 'What authentication method does the Orders API use and what is the token expiry?',
      context: `Orders API v3 Documentation:
Authentication: OAuth 2.0 with JWT bearer tokens. Tokens are issued by the auth service
at https://auth.example.com/token using the client_credentials grant type.
Token expiry: Access tokens expire after 3600 seconds (1 hour). Refresh tokens are valid
for 30 days. To refresh, POST to /auth/refresh with the refresh_token field.
Rate limits: 500 requests per minute per client_id. The X-RateLimit-Remaining header
shows remaining quota. Exceeded limits return 429 with Retry-After header.`,
      sources: 'Orders API v3 Documentation',
    },
  },
  {
    description: 'Answer with partial information in context',
    vars: {
      query: 'What are the SLA guarantees for the Premium tier?',
      context: `Service Level Agreement Summary:
Standard tier: 99.5% uptime guarantee, 4-hour response time for critical issues.
Professional tier: 99.9% uptime guarantee, 2-hour response time for critical issues, 24/7 support.
Enterprise tier: 99.99% uptime, 30-minute response, dedicated support engineer.
All tiers include automatic failover and geo-redundancy.
SLA credits are issued as percentage of monthly fee for downtime exceeding guarantees.`,
      sources: 'SLA Documentation v2',
    },
  },
];

export default mergeTemplateWithUserConfig(template, userTests);
