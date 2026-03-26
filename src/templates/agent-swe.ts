import type { Assertion, TestCase } from 'promptfoo';
import { buildMcpAssertions } from '../assertions/mcp-tool-call.js';
import type { TemplateConfig } from './types.js';

const agentSweTemplate: TemplateConfig = {
  name: 'Agent SWE',
  type: 'agent-swe',
  description:
    'Evaluate agent prompts for software engineering tasks — tool calls, code suggestions, and multi-step workflows.',
  defaultAssertions: [
    {
      type: 'contains-json',
    } as Assertion,
    {
      type: 'javascript',
      value: `
        // NOTE: Code-fence JSON extraction is inlined because Promptfoo javascript assertions
        // execute in an isolated context without access to external imports.
        var parsed = null;
        try { parsed = JSON.parse(output); } catch (_e) {
          var fenceMatch = output.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/);
          if (fenceMatch) { try { parsed = JSON.parse(fenceMatch[1].trim()); } catch (_e2) {} }
        }
        if (!parsed || typeof parsed !== 'object') {
          return { pass: false, score: 0, reason: 'Output does not contain a valid JSON object' };
        }
        var hasName = 'name' in parsed || 'tool' in parsed || (parsed.function && 'name' in parsed.function);
        if (!hasName) {
          return { pass: false, score: 0.4, reason: 'Tool call missing name/tool field' };
        }
        return { pass: true, score: 1, reason: 'Tool call has required name field' };
      `,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Agent follows specified workflow steps in correct order',
      threshold: 0.8,
    } as Assertion,
    {
      type: 'llm-rubric',
      value: 'Code suggestions are syntactically valid and follow conventions',
      threshold: 0.7,
    } as Assertion,
  ],
  exampleTestCases: [
    {
      description: 'Create a project card via MCP tool call',
      vars: {
        taskDescription:
          'Create a new card titled "Fix login bug" in the "Backend" column of the "Q4 Sprint" board with high priority.',
        availableTools: 'create_card, move_card, toggle_task, get_board_overview',
        codeContext: 'DevPlanner MCP server v2.1',
        expectedToolSequence: 'create_card',
      },
      assert: buildMcpAssertions([
        {
          toolName: 'create_card',
          requiredArgs: ['title', 'column', 'board'],
          argTypes: {
            title: 'string',
            column: 'string',
            board: 'string',
          },
        },
      ]),
    } as TestCase,
    {
      description: 'Move a card to a different column via MCP tool call',
      vars: {
        taskDescription: 'Move the card "Fix login bug" from "Backend" to "In Review".',
        availableTools: 'create_card, move_card, toggle_task, get_board_overview',
        codeContext: 'DevPlanner MCP server v2.1',
        expectedToolSequence: 'move_card',
      },
      assert: buildMcpAssertions([
        {
          toolName: 'move_card',
          requiredArgs: ['card_id', 'target_column'],
          argTypes: {
            card_id: 'string',
            target_column: 'string',
          },
        },
      ]),
    } as TestCase,
    {
      description: 'Get board overview via MCP tool call',
      vars: {
        taskDescription: 'Show me the current state of the "Q4 Sprint" board.',
        availableTools: 'create_card, move_card, toggle_task, get_board_overview',
        codeContext: 'DevPlanner MCP server v2.1',
      },
      assert: buildMcpAssertions([
        {
          toolName: 'get_board_overview',
          requiredArgs: ['board'],
          argTypes: {
            board: 'string',
          },
        },
      ]),
    } as TestCase,
  ],
  varsSchema: {
    taskDescription: {
      type: 'string',
      description: 'The task the agent must accomplish',
      required: true,
    },
    availableTools: {
      type: 'string',
      description: 'Comma-separated list of available tool names',
      required: true,
    },
    codeContext: {
      type: 'string',
      description: 'Relevant code context or API version information',
      required: false,
    },
    expectedToolSequence: {
      type: 'string',
      description: 'Expected sequence of tool calls for reference',
      required: false,
    },
  },
  programMdSnippet: `## Agent SWE-Specific Guidance
- Tool calls must be output as valid JSON objects with a 'name' and 'arguments' field
- When is-json / contains-json assertions fail, enforce stricter JSON output format instructions
- Ensure the agent selects the correct tool from the available set without hallucinating tools
- Validate that all required arguments are populated with semantically correct values
- For multi-step workflows, instruct the agent to plan the sequence before executing`,
  requiredFeatures: ['contains-json', 'javascript', 'llm-rubric'],
};

export default agentSweTemplate;
