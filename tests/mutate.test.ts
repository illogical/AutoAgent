import { describe, it, expect } from 'vitest';
import { parseMutationResponse, MutationParseError } from '../src/mutate.js';

const validPayload = {
  revisedPrompt: 'Updated prompt text',
  changeSummary: 'Added explicit formatting instructions',
  rationale: 'Three test cases failed the format assertion',
};

describe('parseMutationResponse', () => {
  describe('Step 1 — direct JSON parse', () => {
    it('parses a plain JSON string', () => {
      const raw = JSON.stringify(validPayload);
      const result = parseMutationResponse(raw);
      expect(result).toEqual(validPayload);
    });

    it('parses JSON with leading/trailing whitespace', () => {
      const raw = `   ${JSON.stringify(validPayload)}   `;
      const result = parseMutationResponse(raw);
      expect(result.changeSummary).toBe(validPayload.changeSummary);
    });

    it('parses JSON with internal newlines in prompt text', () => {
      const payload = { ...validPayload, revisedPrompt: 'Line 1\nLine 2\nLine 3' };
      const result = parseMutationResponse(JSON.stringify(payload));
      expect(result.revisedPrompt).toContain('Line 2');
    });
  });

  describe('Step 2 — code fence extraction', () => {
    it('extracts JSON from ```json ... ``` code fence', () => {
      const raw = `Some preamble text\n\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\`\nTrailing text`;
      const result = parseMutationResponse(raw);
      expect(result).toEqual(validPayload);
    });

    it('extracts JSON from plain ``` ... ``` code fence', () => {
      const raw = `\`\`\`\n${JSON.stringify(validPayload)}\n\`\`\``;
      const result = parseMutationResponse(raw);
      expect(result.rationale).toBe(validPayload.rationale);
    });
  });

  describe('Step 3 — regex JSON extraction', () => {
    it('finds a JSON object embedded in prose text', () => {
      const raw = `The model responded: ${JSON.stringify(validPayload)} — end of response.`;
      const result = parseMutationResponse(raw);
      expect(result.revisedPrompt).toBe(validPayload.revisedPrompt);
    });

    it('handles multi-line JSON embedded in text', () => {
      const pretty = JSON.stringify(validPayload, null, 2);
      const raw = `Here is the proposed change:\n${pretty}\nThank you.`;
      const result = parseMutationResponse(raw);
      expect(result.changeSummary).toBe(validPayload.changeSummary);
    });
  });

  describe('parse failures', () => {
    it('throws MutationParseError for plain text with no JSON', () => {
      expect(() => parseMutationResponse('Sorry, I cannot help with that.')).toThrowError(
        MutationParseError,
      );
    });

    it('throws MutationParseError when JSON is missing required fields', () => {
      const incomplete = JSON.stringify({ revisedPrompt: 'Only this field' });
      expect(() => parseMutationResponse(incomplete)).toThrowError(MutationParseError);
    });

    it('throws MutationParseError for an empty string', () => {
      expect(() => parseMutationResponse('')).toThrowError(MutationParseError);
    });

    it('error message includes a preview of the raw response', () => {
      const raw = 'This is not JSON at all';
      try {
        parseMutationResponse(raw);
        expect.fail('Expected MutationParseError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MutationParseError);
        expect((err as MutationParseError).message).toContain('Preview:');
      }
    });

    it('exposes rawResponse on the thrown error', () => {
      const raw = 'not json';
      try {
        parseMutationResponse(raw);
      } catch (err) {
        expect((err as MutationParseError).rawResponse).toBe(raw);
      }
    });
  });

  describe('MutationParseError class', () => {
    it('has name "MutationParseError"', () => {
      const err = new MutationParseError('msg', 'raw');
      expect(err.name).toBe('MutationParseError');
    });

    it('is an instance of Error', () => {
      const err = new MutationParseError('msg', 'raw');
      expect(err).toBeInstanceOf(Error);
    });

    it('stores rawResponse', () => {
      const err = new MutationParseError('msg', 'the raw text');
      expect(err.rawResponse).toBe('the raw text');
    });
  });
});
