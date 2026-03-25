# Summarization Agent — Mutation Strategy

## Goal
Improve the summarization prompt's ability to produce concise, accurate summaries that preserve key information and score well on ROUGE metrics.

## Current Failure Patterns
- Word count out of range (too short: < 20 words, or too long: > 150 words)
- Low ROUGE-N scores (poor lexical overlap with reference summaries)
- Introduction of information not present in source (hallucination, caught by llm-rubric)
- Redundant filler phrases reducing information density

## Mutation Strategies
1. **Word count compliance**: If word count assertions fail, add explicit word count guidance ("write a summary of 40-80 words")
2. **ROUGE improvement**: If ROUGE-N scores are below 0.4, instruct the model to preserve key technical terms and proper nouns verbatim
3. **Factuality**: If llm-rubric factuality assertions fail, add "Do not add any information not explicitly stated in the source text"
4. **Conciseness**: If conciseness rubric fails, add "Eliminate all filler phrases. Every sentence must carry essential information."
5. **Structure**: For structured sources (financial reports), try bullet-point format; for narrative sources, try paragraph format

## Constraints
- Summary must be 20-150 words
- No information not present in the source text
- Preserve key numbers, names, and dates from the source
- Do not editorialize or add context

## Success Criteria
- Word count within [20, 150] for all test cases
- ROUGE-N >= 0.35 for cases with reference summaries
- llm-rubric factuality score >= 0.7
- llm-rubric conciseness score >= 0.7
