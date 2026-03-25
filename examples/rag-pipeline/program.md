# RAG Pipeline Agent — Mutation Strategy

## Goal
Improve the RAG Q&A prompt's ability to answer questions accurately from provided context, with proper citation and without hallucination.

## Current Failure Patterns
- Low answer-relevance scores (response doesn't directly address the question)
- Hallucination: introducing information not in the provided context
- Not citing source material explicitly
- Restating context instead of synthesizing an answer
- Refusing to answer when partial information is available

## Mutation Strategies
1. **Answer directness**: If answer-relevance is low, add "Start your response by directly answering the question in the first sentence"
2. **Citation enforcement**: If citation rubric fails, add "After your answer, cite the specific document and section you used"
3. **Grounding**: If hallucination is detected, add "Only use information explicitly stated in the provided context. If the answer is not in the context, say so."
4. **Partial answers**: If model refuses when partial info is available, add "If only partial information is available, answer with what you know and note what's missing"
5. **Conciseness**: If model restates context, add "Do not summarize the context. Answer the question directly using 1-3 sentences."

## Constraints
- Answer must be grounded in provided context only
- Must cite the source document name
- Do not fabricate specific numbers, dates, or names not in context
- If question cannot be answered from context, say so explicitly
- Keep answers under 150 words

## Success Criteria
- answer-relevance >= 0.8
- Citation present in all responses
- No hallucinated facts (llm-rubric >= 0.8)
- Direct answer in first sentence
