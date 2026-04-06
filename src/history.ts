import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, join, basename } from 'path';
import type { LoopSummary } from './types.js';

const DEFAULT_HISTORY_DIR = './history';

/**
 * Human-readable duration, e.g. "2m 34s", "45s", "1h 3m"
 */
export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Plain-text table listing all runs.
 * Columns: Run (timestamp), Duration, Iters, Baseline, Final, Delta, Stop Reason
 */
export function formatRunTable(summaries: LoopSummary[], filePaths: string[]): string {
  if (summaries.length === 0) return '';

  const header = 'Run                           Duration   Iters   Baseline   Final    Delta    Stop Reason';
  const rows = summaries.map((s, i) => {
    const run = basename(filePaths[i], '.json').replace(/^run-/, '');
    const duration = formatDuration(s.startTime, s.endTime);
    const iters = `${s.totalIterations}/${s.iterations.length > 0 ? s.totalIterations : s.totalIterations}`;
    const baseline = (s.baselineScore * 100).toFixed(1) + '%';
    const final = (s.finalScore * 100).toFixed(1) + '%';
    const delta = (s.cumulativeDelta >= 0 ? '+' : '') + s.cumulativeDelta.toFixed(3);
    const stop = s.stopReason;

    return `${run.padEnd(30)}${duration.padEnd(11)}${iters.padEnd(8)}${baseline.padEnd(11)}${final.padEnd(9)}${delta.padEnd(9)}${stop}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Header row + per-iteration breakdown table for a single run.
 */
export function formatRunDetail(summary: LoopSummary, filePath: string): string {
  const run = basename(filePath, '.json').replace(/^run-/, '');
  const duration = formatDuration(summary.startTime, summary.endTime);

  const headerLines = [
    `Run: ${run}`,
    `Duration: ${duration}`,
    `Baseline: ${(summary.baselineScore * 100).toFixed(1)}%  Final: ${(summary.finalScore * 100).toFixed(1)}%  Delta: ${(summary.cumulativeDelta >= 0 ? '+' : '')}${summary.cumulativeDelta.toFixed(3)}`,
    `Iterations: ${summary.totalIterations}  Improved: ${summary.improvementCount}  Reverted: ${summary.revertCount}  Failed: ${summary.failureCount}`,
    `Stop Reason: ${summary.stopReason}`,
    '',
  ];

  const statusLabels: Record<string, string> = {
    improved: 'improved',
    reverted: 'reverted',
    mutation_failed: 'mut_fail',
    eval_failed: 'eval_fail',
  };

  const tableHeader = 'Iter   Status      Change Summary                                               Before     After      Delta      Duration';
  const rows = summary.iterations.map(iter => {
    const num = String(iter.iteration).padEnd(7);
    const status = (statusLabels[iter.status] ?? iter.status).padEnd(12);

    const isFailed = iter.status === 'mutation_failed' || iter.status === 'eval_failed';

    let changeSummary = iter.changeSummary ?? '';
    if (changeSummary.length > 60) changeSummary = changeSummary.slice(0, 60) + '…';

    let detail: string;
    if (isFailed) {
      const errorText = iter.error ?? 'unknown error';
      const truncated = errorText.length > 60 ? errorText.slice(0, 60) + '…' : errorText;
      detail = changeSummary.padEnd(61) + truncated;
    } else {
      const before = iter.beforeScore !== undefined ? (iter.beforeScore * 100).toFixed(1) + '%' : 'N/A';
      const after = iter.afterScore !== undefined ? (iter.afterScore * 100).toFixed(1) + '%' : 'N/A';
      const delta = iter.scoreDelta !== undefined ? (iter.scoreDelta >= 0 ? '+' : '') + iter.scoreDelta.toFixed(3) : 'N/A';
      const dur = iter.timings ? formatDuration(iter.timestamp, new Date(new Date(iter.timestamp).getTime() + iter.timings.totalMs).toISOString()) : 'N/A';
      detail = `${changeSummary.padEnd(61)}${before.padEnd(11)}${after.padEnd(11)}${delta.padEnd(11)}${dur}`;
    }

    return `${num}${status}${detail}`;
  });

  return [...headerLines, tableHeader, ...rows].join('\n');
}

/**
 * Load changeSummary strings from the most recent `maxRuns` history files.
 * De-duplicates via Set. Silently skips corrupt/unreadable files.
 */
export async function loadPriorChangeSummaries(
  historyDir?: string,
  maxRuns = 5,
): Promise<string[]> {
  const paths = await listRunHistories(historyDir);
  const recentPaths = paths.slice(-Math.max(1, maxRuns));
  const summaries: string[] = [];
  for (const p of recentPaths) {
    try {
      const run = await loadRunHistory(p);
      for (const iter of run.iterations) {
        if (iter.changeSummary) summaries.push(iter.changeSummary);
      }
    } catch {
      // skip corrupt or unreadable history files
    }
  }
  return [...new Set(summaries)];
}

export async function writeRunHistory(
  summary: LoopSummary,
  historyDir?: string,
): Promise<string> {
  const dir = resolve(historyDir ?? DEFAULT_HISTORY_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(dir, `run-${timestamp}.json`);
  writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
  return filePath;
}

export async function loadRunHistory(path: string): Promise<LoopSummary> {
  const raw = readFileSync(resolve(path), 'utf-8');
  return JSON.parse(raw) as LoopSummary;
}

export async function listRunHistories(historyDir?: string): Promise<string[]> {
  const dir = resolve(historyDir ?? DEFAULT_HISTORY_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith('run-') && f.endsWith('.json'))
    .map(f => join(dir, f))
    .sort();
}
