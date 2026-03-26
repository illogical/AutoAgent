import { describe, it, expect } from 'vitest';
import {
  McpToolCallValidator,
  mcpToolCallAssertion,
  buildMcpAssertions,
} from '../src/assertions/mcp-tool-call.js';
import type { McpToolCallSchema } from '../src/assertions/mcp-tool-call.js';

// Helper: evaluate a self-contained assertion string against an output value.
// Mirrors how Promptfoo runs javascript assertions internally.
function runAssertion(assertionCode: string, output: string): { pass: boolean; score: number; reason: string } {
  // The generated code uses `output` as a free variable.
  // eslint-disable-next-line no-new-func
  return new Function('output', `return (${assertionCode})`)(output) as {
    pass: boolean;
    score: number;
    reason: string;
  };
}

const createCardSchema: McpToolCallSchema = {
  toolName: 'create_card',
  requiredArgs: ['projectSlug', 'title', 'lane'],
  argTypes: { projectSlug: 'string', title: 'string', lane: 'string' },
  optionalArgs: ['description'],
};

describe('McpToolCallValidator', () => {
  const validator = new McpToolCallValidator([createCardSchema]);

  describe('validateStructure — valid tool calls', () => {
    it('passes a well-formed tool call using .name / .arguments', () => {
      const output = JSON.stringify({
        name: 'create_card',
        arguments: { projectSlug: 'my-project', title: 'Fix bug', lane: 'todo' },
      });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('passes a tool call using .tool / .params convention', () => {
      const output = JSON.stringify({
        tool: 'create_card',
        params: { projectSlug: 'p', title: 'T', lane: 'in-progress' },
      });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(true);
    });

    it('passes JSON embedded in a markdown code fence', () => {
      const json = JSON.stringify({
        name: 'create_card',
        arguments: { projectSlug: 'p', title: 'T', lane: 'done' },
      });
      const output = `Here is the tool call:\n\`\`\`json\n${json}\n\`\`\``;
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(true);
    });
  });

  describe('validateStructure — failures', () => {
    it('fails when output is plain text (no JSON)', () => {
      const result = validator.validateStructure('I will create the card now.');
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('fails when tool name is wrong', () => {
      const output = JSON.stringify({
        name: 'delete_card',
        arguments: { projectSlug: 'p', title: 'T', lane: 'todo' },
      });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('delete_card');
    });

    it('fails when tool name is missing entirely', () => {
      const output = JSON.stringify({ arguments: { projectSlug: 'p', title: 'T', lane: 'todo' } });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/tool name/i);
    });

    it('fails when a required argument is absent', () => {
      const output = JSON.stringify({
        name: 'create_card',
        arguments: { projectSlug: 'p', title: 'T' }, // missing 'lane'
      });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('lane');
    });

    it('fails when tool is not in the known schema list', () => {
      const output = JSON.stringify({
        name: 'move_card',
        arguments: { projectSlug: 'p', cardSlug: 'c', targetLane: 'done' },
      });
      const result = validator.validateStructure(output);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('move_card');
    });
  });
});

describe('mcpToolCallAssertion (generated JS string)', () => {
  it('passes for a valid tool call JSON', () => {
    const code = mcpToolCallAssertion(createCardSchema);
    const output = JSON.stringify({
      name: 'create_card',
      arguments: { projectSlug: 'my-project', title: 'Fix bug', lane: 'todo' },
    });
    const result = runAssertion(code, output);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('fails when tool name does not match', () => {
    const code = mcpToolCallAssertion(createCardSchema);
    const output = JSON.stringify({
      name: 'move_card',
      arguments: { projectSlug: 'p', title: 'T', lane: 'todo' },
    });
    const result = runAssertion(code, output);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/move_card/);
  });

  it('fails when required arg is missing', () => {
    const code = mcpToolCallAssertion(createCardSchema);
    const output = JSON.stringify({
      name: 'create_card',
      arguments: { projectSlug: 'p', title: 'T' }, // missing lane
    });
    const result = runAssertion(code, output);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/lane/);
  });

  it('validates argument types correctly', () => {
    const schema: McpToolCallSchema = {
      toolName: 'toggle_task',
      requiredArgs: ['projectSlug', 'taskIndex'],
      argTypes: { projectSlug: 'string', taskIndex: 'number' },
    };
    const code = mcpToolCallAssertion(schema);

    // Correct types: should pass
    const validOutput = JSON.stringify({
      name: 'toggle_task',
      arguments: { projectSlug: 'p', taskIndex: 3 },
    });
    expect(runAssertion(code, validOutput).pass).toBe(true);

    // Wrong type for taskIndex (string instead of number): should fail
    const wrongTypeOutput = JSON.stringify({
      name: 'toggle_task',
      arguments: { projectSlug: 'p', taskIndex: '3' },
    });
    const wrongResult = runAssertion(code, wrongTypeOutput);
    expect(wrongResult.pass).toBe(false);
    expect(wrongResult.reason).toMatch(/taskIndex/);
  });

  it('extracts JSON from a markdown code fence', () => {
    const code = mcpToolCallAssertion(createCardSchema);
    const json = JSON.stringify({
      name: 'create_card',
      arguments: { projectSlug: 'p', title: 'T', lane: 'todo' },
    });
    const output = `\`\`\`json\n${json}\n\`\`\``;
    const result = runAssertion(code, output);
    expect(result.pass).toBe(true);
  });

  it('returns score 0 when output is not parseable JSON', () => {
    const code = mcpToolCallAssertion(createCardSchema);
    const result = runAssertion(code, 'I will create the card for you.');
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe('buildMcpAssertions', () => {
  it('returns one Assertion per schema', () => {
    const schemas: McpToolCallSchema[] = [
      { toolName: 'create_card', requiredArgs: ['title'] },
      { toolName: 'move_card', requiredArgs: ['cardSlug', 'targetLane'] },
    ];
    const assertions = buildMcpAssertions(schemas);
    expect(assertions).toHaveLength(2);
    expect(assertions[0]?.type).toBe('javascript');
    expect(assertions[1]?.type).toBe('javascript');
  });

  it('generates distinct assertion strings for different schemas', () => {
    const schemas: McpToolCallSchema[] = [
      { toolName: 'toolA', requiredArgs: ['a'] },
      { toolName: 'toolB', requiredArgs: ['b'] },
    ];
    const assertions = buildMcpAssertions(schemas);
    expect(assertions[0]?.value).not.toBe(assertions[1]?.value);
    expect(assertions[0]?.value as string).toContain('toolA');
    expect(assertions[1]?.value as string).toContain('toolB');
  });
});
