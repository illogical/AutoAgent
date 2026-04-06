import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoopSummary, IterationSummary } from '../src/types.js';

// We need to mock the filesystem functions used by loadPriorChangeSummaries
// which calls listRunHistories and loadRunHistory internally.
// We mock the fs module to control what files are "on disk".

const mockHistoryFiles: Record<string, LoopSummary> = {};
let mockFileList: string[] = [];

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (path: string) => {
      if (path.includes('history')) return true;
      return actual.existsSync(path);
    },
    readdirSync: (dir: string) => {
      if (String(dir).includes('history')) {
        return mockFileList.map(f => f.split('/').pop()!);
      }
      return actual.readdirSync(dir);
    },
    readFileSync: (path: string, enc?: string) => {
      const key = Object.keys(mockHistoryFiles).find(k => String(path).includes(k));
      if (key) return JSON.stringify(mockHistoryFiles[key]);
      return actual.readFileSync(path, enc as BufferEncoding);
    },
  };
});

// Import after mocking
const { loadPriorChangeSummaries } = await import('../src/history.js');

function makeRun(changeSummaries: string[]): LoopSummary {
  return {
    startTime: '2026-04-05T10:00:00.000Z',
    endTime: '2026-04-05T10:05:00.000Z',
    totalIterations: changeSummaries.length,
    improvementCount: changeSummaries.length,
    revertCount: 0,
    failureCount: 0,
    cumulativeDelta: 0.1,
    finalScore: 0.8,
    baselineScore: 0.7,
    stopReason: 'max_iterations',
    iterations: changeSummaries.map((cs, i) => ({
      iteration: i + 1,
      status: 'improved' as const,
      changeSummary: cs,
      timestamp: '2026-04-05T10:01:00.000Z',
    })),
  };
}

beforeEach(() => {
  // Reset mock state
  for (const key of Object.keys(mockHistoryFiles)) {
    delete mockHistoryFiles[key];
  }
  mockFileList = [];
});

describe('loadPriorChangeSummaries', () => {
  it('returns de-duplicated summaries across multiple runs', async () => {
    mockHistoryFiles['run-001.json'] = makeRun(['change A', 'change B']);
    mockHistoryFiles['run-002.json'] = makeRun(['change B', 'change C']); // 'change B' is a dupe
    mockFileList = ['run-001.json', 'run-002.json'];

    const result = await loadPriorChangeSummaries('./history', 5);
    expect(result).toHaveLength(3);
    expect(result).toContain('change A');
    expect(result).toContain('change B');
    expect(result).toContain('change C');
  });

  it('respects maxRuns limit (returns only from the last N files)', async () => {
    mockHistoryFiles['run-001.json'] = makeRun(['old change']);
    mockHistoryFiles['run-002.json'] = makeRun(['recent change']);
    mockFileList = ['run-001.json', 'run-002.json'];

    const result = await loadPriorChangeSummaries('./history', 1);
    expect(result).toHaveLength(1);
    expect(result).toContain('recent change');
    expect(result).not.toContain('old change');
  });

  it('returns empty array when no history files exist', async () => {
    mockFileList = [];
    const result = await loadPriorChangeSummaries('./history', 5);
    expect(result).toHaveLength(0);
  });

  it('maxRuns: 0 is clamped to 1, does not return full history', async () => {
    mockHistoryFiles['run-001.json'] = makeRun(['change A']);
    mockHistoryFiles['run-002.json'] = makeRun(['change B']);
    mockHistoryFiles['run-003.json'] = makeRun(['change C']);
    mockFileList = ['run-001.json', 'run-002.json', 'run-003.json'];

    // maxRuns=0 should be clamped to 1
    const result = await loadPriorChangeSummaries('./history', 0);
    expect(result).toHaveLength(1);
    expect(result).toContain('change C');
  });
});

// Test the mutation prompt integration
describe('buildMutationUserPrompt with priorChangeSummaries', () => {
  // Since buildMutationUserPrompt is not exported, we test through mutatePrompt
  // by mocking callOllama and capturing the userMessage argument.

  // Shared capture variable accessible to the hoisted mock
  let capturedUserMessage = '';

  vi.mock('../src/ollama.js', () => ({
    callOllama: vi.fn(async (_model: string, _url: string, _sys: string, user: string) => {
      // We can't close over capturedUserMessage here since mock is hoisted.
      // Instead we store on the mock function itself.
      (callOllamaMock as any).__lastUserMessage = user;
      return JSON.stringify({
        revisedPrompt: 'test',
        changeSummary: 'test',
        rationale: 'test',
      });
    }),
  }));

  // Get a reference to the mocked function
  let callOllamaMock: any;

  it('includes "Previously tried approaches" section when summaries provided', async () => {
    const ollamaModule = await import('../src/ollama.js');
    callOllamaMock = ollamaModule.callOllama;
    (callOllamaMock as any).__lastUserMessage = '';

    // Re-assign the mock implementation so it captures properly
    callOllamaMock.mockImplementation(async (_model: string, _url: string, _sys: string, user: string) => {
      capturedUserMessage = user;
      return JSON.stringify({
        revisedPrompt: 'test',
        changeSummary: 'test',
        rationale: 'test',
      });
    });

    const { mutatePrompt } = await import('../src/mutate.js');

    const config = {
      mutationModel: 'test',
      ollamaBaseUrl: 'http://localhost:11434',
      mutationTemperature: 0.8,
    } as any;

    await mutatePrompt(
      'current prompt',
      'program instructions',
      null,
      [],
      config,
      ['Added error handling', 'Restructured sections'],
    );

    expect(capturedUserMessage).toContain('Previously tried approaches');
    expect(capturedUserMessage).toContain('- Added error handling');
    expect(capturedUserMessage).toContain('- Restructured sections');
  });

  it('omits "Previously tried approaches" section when no summaries', async () => {
    const ollamaModule = await import('../src/ollama.js');
    callOllamaMock = ollamaModule.callOllama;

    callOllamaMock.mockImplementation(async (_model: string, _url: string, _sys: string, user: string) => {
      capturedUserMessage = user;
      return JSON.stringify({
        revisedPrompt: 'test',
        changeSummary: 'test',
        rationale: 'test',
      });
    });

    const { mutatePrompt } = await import('../src/mutate.js');

    const config = {
      mutationModel: 'test',
      ollamaBaseUrl: 'http://localhost:11434',
      mutationTemperature: 0.8,
    } as any;

    await mutatePrompt(
      'current prompt',
      'program instructions',
      null,
      [],
      config,
      [],
    );

    expect(capturedUserMessage).not.toContain('Previously tried approaches');
  });
});
