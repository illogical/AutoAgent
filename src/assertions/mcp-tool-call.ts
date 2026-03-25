import type { Assertion } from 'promptfoo';

export interface McpToolCallSchema {
  toolName: string;
  requiredArgs: string[];
  argTypes?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  optionalArgs?: string[];
}

/**
 * Generate a self-contained JavaScript assertion string for Promptfoo that validates
 * an MCP tool call structure in the model output.
 */
export function mcpToolCallAssertion(schema: McpToolCallSchema): string {
  const argTypesJson = schema.argTypes ? JSON.stringify(schema.argTypes) : '{}';
  const requiredArgsJson = JSON.stringify(schema.requiredArgs);
  const toolNameJson = JSON.stringify(schema.toolName);

  return `
(function() {
  var toolName = ${toolNameJson};
  var requiredArgs = ${requiredArgsJson};
  var argTypes = ${argTypesJson};

  // Attempt to parse JSON, with fallback to extract from markdown code fences
  // NOTE: All regex patterns are self-contained because Promptfoo javascript assertions
  // run in an isolated context with no access to external imports.
  var parsed = null;
  try {
    parsed = JSON.parse(output);
  } catch (_e) {
    // Fallback: extract JSON from a markdown code fence
    var fenceMatch = output.match(/\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\\`\\\`\\\`/);
    if (fenceMatch) {
      try { parsed = JSON.parse(fenceMatch[1].trim()); } catch (_e2) {}
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { pass: false, score: 0, reason: 'Output is not valid JSON or does not contain a JSON object' };
  }

  // Extract tool name from various field conventions
  var foundName = parsed.name || parsed.tool || (parsed.function && parsed.function.name);
  if (!foundName) {
    return { pass: false, score: 0, reason: 'No tool name field found (.name, .tool, or .function.name)' };
  }

  if (foundName !== toolName) {
    return { pass: false, score: 0, reason: 'Tool name "' + foundName + '" does not match expected "' + toolName + '"' };
  }

  // Extract arguments from various field conventions
  var args = parsed.arguments || parsed.params || parsed.input;
  if (!args || typeof args !== 'object') {
    return { pass: false, score: 0.3, reason: 'No arguments object found (.arguments, .params, or .input)' };
  }

  // Check required arguments are present
  for (var i = 0; i < requiredArgs.length; i++) {
    var field = requiredArgs[i];
    if (!(field in args)) {
      return { pass: false, score: 0.5, reason: 'Required argument "' + field + '" is missing from tool call' };
    }
  }

  // Check argument types if schema provided
  var typeKeys = Object.keys(argTypes);
  for (var j = 0; j < typeKeys.length; j++) {
    var key = typeKeys[j];
    if (!(key in args)) continue;
    var expectedType = argTypes[key];
    var actualValue = args[key];
    var actualType = Array.isArray(actualValue) ? 'array' : typeof actualValue;
    if (actualType !== expectedType) {
      return { pass: false, score: 0.7, reason: 'Argument "' + key + '" has type "' + actualType + '" but expected "' + expectedType + '"' };
    }
  }

  return { pass: true, score: 1, reason: 'Valid MCP tool call for "' + toolName + '" with all required arguments' };
})()
  `.trim();
}

/**
 * Build an array of Promptfoo Assertion objects for a list of MCP tool call schemas.
 */
export function buildMcpAssertions(schemas: McpToolCallSchema[]): Assertion[] {
  return schemas.map(schema => ({
    type: 'javascript' as const,
    value: mcpToolCallAssertion(schema),
  }));
}

export class McpToolCallValidator {
  constructor(private readonly schemas: McpToolCallSchema[]) {}

  validateStructure(output: string): { pass: boolean; reason: string; score: number } {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(output);
    } catch {
      const fenceMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        try {
          parsed = JSON.parse(fenceMatch[1].trim());
        } catch {
          // fall through to failure
        }
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { pass: false, score: 0, reason: 'Output is not valid JSON' };
    }

    const obj = parsed as Record<string, unknown>;
    const foundName =
      (typeof obj['name'] === 'string' ? obj['name'] : undefined) ??
      (typeof obj['tool'] === 'string' ? obj['tool'] : undefined) ??
      (obj['function'] && typeof (obj['function'] as Record<string, unknown>)['name'] === 'string'
        ? (obj['function'] as Record<string, unknown>)['name'] as string
        : undefined);

    if (!foundName) {
      return { pass: false, score: 0, reason: 'No tool name field found' };
    }

    const matchingSchema = this.schemas.find(s => s.toolName === foundName);
    if (!matchingSchema) {
      return {
        pass: false,
        score: 0,
        reason: `Tool "${foundName}" not in expected set: ${this.schemas.map(s => s.toolName).join(', ')}`,
      };
    }

    const args =
      (obj['arguments'] as Record<string, unknown> | undefined) ??
      (obj['params'] as Record<string, unknown> | undefined) ??
      (obj['input'] as Record<string, unknown> | undefined);

    if (!args || typeof args !== 'object') {
      return { pass: false, score: 0.3, reason: 'No arguments object found' };
    }

    for (const field of matchingSchema.requiredArgs) {
      if (!(field in args)) {
        return { pass: false, score: 0.5, reason: `Required argument "${field}" is missing` };
      }
    }

    return { pass: true, score: 1, reason: `Valid tool call for "${foundName}"` };
  }
}
