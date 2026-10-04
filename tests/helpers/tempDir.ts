import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

export async function createTempDir(): Promise<string> {
  // macOS では tmpdir がシンボリックリンクのため、git の出力と比較できるよう実パスに解決する
  return realpath(await mkdtemp(join(tmpdir(), 'taskcli-test-')));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * 初期コミットを持つ Git リポジトリを一時ディレクトリに作成する。
 */
export async function createTempGitRepo(): Promise<string> {
  const dir = await createTempDir();
  const git = simpleGit({ baseDir: dir });
  await git.init(['-b', 'main']);
  await git.addConfig('user.name', 'TaskCLI Test');
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await writeFile(join(dir, 'README.md'), '# test\n');
  await git.add('README.md');
  await git.commit('initial commit');
  return dir;
}
