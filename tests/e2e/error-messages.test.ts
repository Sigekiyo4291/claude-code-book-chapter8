import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import { createTempDir, removeTempDir } from '../helpers/tempDir.js';

describe('エラーメッセージと終了コード(E2E)', () => {
  let dir: string;
  const task = (...args: string[]) => runCli(args, { cwd: dir });

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('存在しないIDの場合、メッセージとヒントを標準エラー出力に表示し 1 で終了する', async () => {
    const result = await task('show', '5');

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      '✗ タスク #5 が見つかりません\n  task list --all で既存のタスクを確認できます\n'
    );
  });

  it('空のタイトルの場合、タスクを作成せず 1 で終了する', async () => {
    const result = await task('add', '');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('タイトルは1〜200文字で入力してください');
    expect((await task('list')).stdout).toContain('タスクがありません');
  });

  it('201文字のタイトルは拒否する', async () => {
    const result = await task('add', 'a'.repeat(201));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('(現在: 201文字)');
  });

  it('不明なコマンドの場合、類似コマンドを提案する', async () => {
    const result = await task('lst');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('✗ 不明なコマンドです: lst');
    expect(result.stderr).toContain('もしかして: list');
  });

  it('不正な状態遷移の場合、次に取るべき操作を案内する', async () => {
    await task('add', 'タスク');
    await task('done', '1');

    const result = await task('done', '1');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      '✗ タスク #1 は既に完了しています(completed)\n  再開する場合は task start 1 を実行してください\n'
    );
  });

  it('tasks.json が破損している場合、上書きせず復元方法を案内する', async () => {
    await mkdir(join(dir, '.task'));
    await writeFile(join(dir, '.task', 'tasks.json'), '{ broken');

    const result = await task('add', '新しいタスク');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('tasks.json を読み込めません');
    expect(result.stderr).toContain('cp ');
    expect(result.stderr).toContain('tasks.json.bak');
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(join(dir, '.task', 'tasks.json'), 'utf8')).toBe(
      '{ broken'
    );
  });

  it('Gitリポジトリ外での start は警告付きで成功し、hook install は失敗する', async () => {
    await task('add', 'タスク');

    const start = await task('start', '1');
    const hook = await task('hook', 'install');

    expect(start.exitCode).toBe(0);
    expect(start.stderr).toContain(
      '⚠ Gitリポジトリではないため、ブランチは作成されませんでした'
    );
    expect(hook.exitCode).toBe(1);
    expect(hook.stderr).toContain('✗ Gitリポジトリではありません');
  });

  it('--help と --version は 0 で終了する', async () => {
    const help = await task('--help');
    const version = await task('--version');
    const startHelp = await task('start', '--help');

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('Usage: task');
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(startHelp.stdout).toContain('--branch <name>');
  });
});
