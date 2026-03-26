import simpleGit from 'simple-git';
import { resolve } from 'path';

export async function isGitRepo(path?: string): Promise<boolean> {
  try {
    const repoPath = resolve(path ?? process.cwd());
    const git = simpleGit(repoPath);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

export async function gitCommit(
  filePath: string,
  message: string,
  repoPath?: string,
): Promise<void> {
  const git = simpleGit(resolve(repoPath ?? process.cwd()));
  await git.add(filePath);
  await git.commit(message, { '--allow-empty': null });
}

export async function gitRevert(
  filePath: string,
  repoPath?: string,
): Promise<void> {
  const git = simpleGit(resolve(repoPath ?? process.cwd()));
  await git.checkout([filePath]);
}
