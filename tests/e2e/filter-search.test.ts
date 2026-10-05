import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import { createTempGitRepo, removeTempDir } from '../helpers/tempDir.js';

describe('絞り込み・検索(E2E)', () => {
  let repoDir: string;
  const task = (...args: string[]) => runCli(args, { cwd: repoDir });

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
    await task('add', 'ユーザー認証機能の実装');
    await task('add', 'ログイン画面', '-d', 'JWT を使った API 認証');
    await task('add', 'README 更新');
    await task('add', '認証ログの整理');
    await task('start', '1');
    await task('done', '3');
    await task('archive', '4');
  });

  afterEach(async () => {
    await removeTempDir(repoDir);
  });

  it('list --status で指定したステータスのタスクのみ表示する', async () => {
    const inProgress = await task('list', '--status', 'in_progress');
    expect(inProgress.exitCode).toBe(0);
    expect(inProgress.stdout).toBe(
      [
        '  ID  Status       Title                   Branch',
        '* 1   in_progress  ユーザー認証機能の実装  feature/task-1',
        '',
      ].join('\n')
    );

    const multiple = await task('list', '-s', 'open,archived');
    expect(multiple.stdout).toContain('ログイン画面');
    expect(multiple.stdout).toContain('認証ログの整理');
    expect(multiple.stdout).not.toContain('README');
  });

  it('不正なステータスの場合、有効な値を案内して 1 で終了する', async () => {
    const result = await task('list', '--status', 'done');

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      '✗ 不正なステータスです: done\n  有効な値: open, in_progress, completed, archived\n'
    );
  });

  it('search でタイトル・説明を大文字小文字・全角半角を区別せずに検索する', async () => {
    const result = await task('search', 'ｊｗｔ');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ログイン画面');
    expect(result.stdout.trimEnd().split('\n')).toHaveLength(2);

    const multiple = await task('search', '認証');
    expect(multiple.stdout).toContain('ユーザー認証機能の実装');
    expect(multiple.stdout).toContain('ログイン画面');
    expect(multiple.stdout).not.toContain('認証ログの整理');
  });

  it('search で一致しない場合、0 で終了し --all を案内する', async () => {
    const result = await task('search', '認証ログ');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        '"認証ログ" に一致するタスクはありません',
        '(アーカイブ済みのタスクが 1 件あります。--all で表示できます)',
        '',
      ].join('\n')
    );
    expect((await task('search', '認証ログ', '--all')).stdout).toContain(
      '認証ログの整理'
    );
  });
});
