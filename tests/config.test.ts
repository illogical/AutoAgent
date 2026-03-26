import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('DEFAULT_CONFIG', () => {
  it('has the expected Ollama base URL', () => {
    expect(DEFAULT_CONFIG.ollamaBaseUrl).toBe('http://localhost:11434');
  });

  it('has sensible iteration defaults', () => {
    expect(DEFAULT_CONFIG.maxIterations).toBe(20);
    expect(DEFAULT_CONFIG.plateauThreshold).toBe(5);
    expect(DEFAULT_CONFIG.targetScoreDelta).toBe(0.3);
  });

  it('has sensible temperature defaults', () => {
    expect(DEFAULT_CONFIG.evalTemperature).toBe(0.3);
    expect(DEFAULT_CONFIG.mutationTemperature).toBe(0.8);
    expect(DEFAULT_CONFIG.judgeTemperature).toBe(0.2);
  });

  it('has a positive improvement threshold', () => {
    expect(DEFAULT_CONFIG.improvementThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.improvementThreshold).toBe(0.02);
  });

  it('has git integration enabled by default', () => {
    expect(DEFAULT_CONFIG.gitEnabled).toBe(true);
    expect(DEFAULT_CONFIG.autoCommit).toBe(true);
    expect(DEFAULT_CONFIG.autoRevert).toBe(false);
  });

  it('has at least one default target model', () => {
    expect(DEFAULT_CONFIG.targetModels).toBeInstanceOf(Array);
    expect(DEFAULT_CONFIG.targetModels.length).toBeGreaterThan(0);
  });

  it('writes latest results by default for promptfoo view', () => {
    expect(DEFAULT_CONFIG.writeLatestResults).toBe(true);
  });

  it('has a max concurrency limit', () => {
    expect(DEFAULT_CONFIG.maxConcurrency).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxConcurrency).toBe(2);
  });
});
