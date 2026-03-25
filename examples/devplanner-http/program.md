# DevPlanner HTTP Agent — Mutation Strategy

## Goal
Improve the DevPlanner HTTP agent skill's curl command generation to use correct endpoints, methods, headers, and request bodies.

## Current Failure Patterns
- Wrong HTTP method (using GET instead of PATCH/POST)
- Missing Authorization header
- Incorrect URL path (e.g., missing project slug)
- Missing required body fields in JSON payload
- Outputting prose explanation instead of a curl command

## Mutation Strategies
1. **Endpoint precision**: If URL assertions fail, add explicit URL templates for each operation
2. **Method enforcement**: Add explicit mapping of operations to HTTP methods
3. **Header requirements**: If Authorization is missing, add a reminder about Bearer token authentication
4. **Body structure**: If body field assertions fail, add JSON body templates with required fields
5. **Format enforcement**: Add explicit instruction to output only a curl command in a code block

## Constraints
- All curl commands must include an Authorization Bearer token (use placeholder `$TOKEN`)
- JSON bodies must use `-H "Content-Type: application/json"` and `-d '{...}'`
- URL must reference the project slug as a path segment, not query parameter
- Keep the prompt under 500 words

## Success Criteria
- Correct HTTP method for each operation
- Authorization header always present
- URL includes correct path segments
- Required body fields always present in POST/PATCH requests
