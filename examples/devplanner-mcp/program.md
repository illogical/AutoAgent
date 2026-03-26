# DevPlanner MCP Agent — Mutation Strategy

## Goal
Improve the DevPlanner MCP agent skill's ability to select the correct tool and populate arguments accurately from natural language requests.

## Current Failure Patterns
Analyze the eval feedback and focus on these failure modes:
- Incorrect tool selected (e.g., using `create_card` when `move_card` is needed)
- Missing required arguments (`board`, `card_id`, `target_column`)
- Wrong argument types (passing integers where strings are expected)
- Extra explanation text instead of pure JSON tool call output

## Mutation Strategies
1. **Argument extraction**: If required args are missing, add explicit extraction instructions ("extract the board name from the user message and pass it as the `board` argument")
2. **Tool disambiguation**: If the wrong tool is selected, add clearer trigger phrases for each tool
3. **Output format enforcement**: If output contains prose, add a stronger "respond only with a JSON tool call object" instruction
4. **Type hints**: If type errors occur, specify argument types explicitly in the prompt

## Constraints
- Keep the prompt concise — under 400 words
- Preserve the tool name and argument schema exactly as defined in the MCP server spec
- Do not add fictional tools not in the available set
- JSON output must use `{"name": "tool_name", "arguments": {...}}` format

## Success Criteria
- All 4 test cases pass with valid JSON tool calls
- Tool names match exactly (case-sensitive)
- Required arguments are always present with correct types
