# SourceManager HTTP Agent — Mutation Strategy

## Goal
Improve the SourceManager REST API agent skill's ability to generate correct curl commands with proper authentication and endpoint structure.

## Current Failure Patterns
- Missing `X-DevServer-Token` authentication header (most common failure)
- Using wrong HTTP method (GET instead of POST for state-changing operations)
- Incorrect project ID in URL path
- Missing body fields for operations that require them
- Using `--insecure` / `-k` flag (forbidden for security reasons)

## Mutation Strategies
1. **Authentication emphasis**: If X-DevServer-Token header is missing, move authentication instructions to the first line of the prompt
2. **Method mapping**: Add an explicit table of operations → HTTP methods
3. **Security enforcement**: Add explicit prohibition of `--insecure` and `-k` flags
4. **ID extraction**: If project ID is wrong, add instruction to use the ID exactly as provided, not the project name
5. **Body fields**: For deploy operations, add a body template showing `{"branch": "..."}`

## Constraints
- X-DevServer-Token must always be present (use `$DEVSERVER_TOKEN` as placeholder)
- Never use `--insecure` or `-k` flags (security policy)
- Project ID must appear as a URL path segment (`/v1/projects/{id}/...`)
- Internal base URL: `https://sourcemanager.example.internal`
- Prompt should stay under 400 words

## Success Criteria
- X-DevServer-Token header in every request
- Correct HTTP method for each operation (POST for mutations, GET for reads)
- URL contains the exact project ID from the user message
- No forbidden security flags
