import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import type { LoopSummary } from './types.js';

const DEFAULT_HISTORY_DIR = './history';

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
