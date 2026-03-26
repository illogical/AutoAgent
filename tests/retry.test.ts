import { describe, it, expect } from 'vitest';
import { isInfraFailure } from '../src/retry.js';

describe('isInfraFailure', () => {
  describe('returns true for infrastructure errors', () => {
    it('detects timeout in Error message', () => {
      expect(isInfraFailure(new Error('Request timeout after 30s'))).toBe(true);
    });

    it('detects ECONNREFUSED', () => {
      expect(isInfraFailure(new Error('connect ECONNREFUSED 127.0.0.1:11434'))).toBe(true);
    });

    it('detects ECONNRESET', () => {
      expect(isInfraFailure(new Error('read ECONNRESET'))).toBe(true);
    });

    it('detects ETIMEDOUT', () => {
      expect(isInfraFailure(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('detects ENOTFOUND (DNS lookup failure)', () => {
      expect(isInfraFailure(new Error('getaddrinfo ENOTFOUND localhost'))).toBe(true);
    });

    it('detects socket hang up', () => {
      expect(isInfraFailure(new Error('socket hang up'))).toBe(true);
    });

    it('detects network error string', () => {
      expect(isInfraFailure(new Error('network error occurred'))).toBe(true);
    });

    it('detects HTTP 500 in error message', () => {
      expect(isInfraFailure(new Error('Ollama API error 500: Internal Server Error'))).toBe(true);
    });

    it('detects HTTP 502 (bad gateway)', () => {
      expect(isInfraFailure(new Error('502 bad gateway'))).toBe(true);
    });

    it('detects HTTP 503 (service unavailable)', () => {
      expect(isInfraFailure(new Error('503 service unavailable'))).toBe(true);
    });

    it('detects HTTP 504 (gateway timeout)', () => {
      expect(isInfraFailure(new Error('504 gateway timeout'))).toBe(true);
    });

    it('detects CUDA out of memory (Ollama OOM)', () => {
      expect(isInfraFailure(new Error('cuda out of memory while allocating tensor'))).toBe(true);
    });

    it('detects generic out of memory', () => {
      expect(isInfraFailure(new Error('out of memory'))).toBe(true);
    });

    it('detects "model not found" (Ollama model missing)', () => {
      expect(isInfraFailure(new Error('model not found: qwen3:8b'))).toBe(true);
    });

    it('accepts a plain string error', () => {
      expect(isInfraFailure('ECONNREFUSED')).toBe(true);
    });

    it('accepts an object with a message field', () => {
      expect(isInfraFailure({ message: 'timeout exceeded' })).toBe(true);
    });
  });

  describe('returns false for logic / eval errors', () => {
    it('returns false for assertion failures (not infra)', () => {
      expect(isInfraFailure(new Error('llm-rubric scored 0.4 below threshold 0.7'))).toBe(false);
    });

    it('returns false for JSON parse errors', () => {
      expect(isInfraFailure(new Error('Unexpected token at position 12'))).toBe(false);
    });

    it('returns false for validation errors', () => {
      expect(isInfraFailure(new Error('ZodError: invalid config'))).toBe(false);
    });

    it('returns false for null', () => {
      expect(isInfraFailure(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isInfraFailure(undefined)).toBe(false);
    });

    it('returns false for a passing result object', () => {
      expect(isInfraFailure({ pass: true, score: 1 })).toBe(false);
    });

    it('is case-insensitive for error message matching', () => {
      expect(isInfraFailure(new Error('Connection ECONNREFUSED'))).toBe(true);
    });
  });
});
