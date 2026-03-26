import { buildMcpAssertions } from '../../src/assertions/index.js';
import type { TestCase } from 'promptfoo';

const testCases: TestCase[] = [
  {
    description: 'Create a new card in the Backlog column',
    vars: {
      userMessage:
        'Create a card titled "Fix authentication timeout" in the "Backlog" column of the "Q4 Sprint" board with high priority.',
      availableTools: 'create_card, move_card, toggle_task, get_board_overview',
      codeContext: 'DevPlanner MCP server v2.1',
    },
    assert: buildMcpAssertions([
      {
        toolName: 'create_card',
        requiredArgs: ['title', 'column', 'board'],
        argTypes: { title: 'string', column: 'string', board: 'string' },
      },
    ]),
  },
  {
    description: 'Move a card from In Progress to Review',
    vars: {
      userMessage: 'Move card "Fix authentication timeout" from "In Progress" to "In Review".',
      availableTools: 'create_card, move_card, toggle_task, get_board_overview',
      codeContext: 'DevPlanner MCP server v2.1',
    },
    assert: buildMcpAssertions([
      {
        toolName: 'move_card',
        requiredArgs: ['card_id', 'target_column'],
        argTypes: { card_id: 'string', target_column: 'string' },
      },
    ]),
  },
  {
    description: 'Toggle a task item as complete',
    vars: {
      userMessage: 'Mark the subtask "Write unit tests" on card "Fix authentication timeout" as done.',
      availableTools: 'create_card, move_card, toggle_task, get_board_overview',
      codeContext: 'DevPlanner MCP server v2.1',
    },
    assert: buildMcpAssertions([
      {
        toolName: 'toggle_task',
        requiredArgs: ['card_id', 'task_id', 'completed'],
        argTypes: { card_id: 'string', task_id: 'string', completed: 'boolean' },
      },
    ]),
  },
  {
    description: 'Get an overview of the Q4 Sprint board',
    vars: {
      userMessage: 'Show me all columns and card counts for the "Q4 Sprint" board.',
      availableTools: 'create_card, move_card, toggle_task, get_board_overview',
      codeContext: 'DevPlanner MCP server v2.1',
    },
    assert: buildMcpAssertions([
      {
        toolName: 'get_board_overview',
        requiredArgs: ['board'],
        argTypes: { board: 'string' },
      },
    ]),
  },
];

export default testCases;
