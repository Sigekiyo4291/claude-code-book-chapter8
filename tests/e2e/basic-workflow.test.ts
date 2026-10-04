import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskShim, prependPath, runCli } from '../helpers/runCli.js';
import { createTempGitRepo, removeTempDir } from '../helpers/tempDir.js';

const execFileAsync = promisify(execFile);

describe('基本フロー(E2E)', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await removeTempDir(repoDir);
  });

  it('init → add → list → start → commit → done → archive → list --all', async () => {
    const binDir = await createTaskShim(join(repoDir, '.git', 'test-bin'));
    const env = { PATH: prependPath(binDir) };
    const task = (...args: string[]) => runCli(args, { cwd: repoDir, env });

    // init
    const init = await task('init');
    expect(init.exitCode).toBe(0);
    expect(init.stdout).toContain('✓ .task/ を初期化しました');

    // add
    expect((await task('add', 'ユーザー認証機能の実装')).stdout).toBe(
      '✓ タスク #1 を作成しました: ユーザー認証機能の実装\n'
    );
    expect((await task('add', 'Initial setup')).exitCode).toBe(0);

    // list
    const list = await task('list');
    expect(list.stdout).toBe(
      [
        '  ID  Status  Title                   Branch',
        '  1   open    ユーザー認証機能の実装  -',
        '  2   open    Initial setup           -',
        '',
      ].join('\n')
    );

    // start
    const start = await task('start', '2');
    expect(start.stdout).toBe(
      '✓ タスク #2 を開始しました(ブランチ: feature/task-2-initial-setup)\n'
    );
    const git = simpleGit(repoDir);
    expect(await git.revparse(['--abbrev-ref', 'HEAD'])).toBe(
      'feature/task-2-initial-setup'
    );
    expect((await task('list')).stdout).toContain(
      '* 2   in_progress  Initial setup           feature/task-2-initial-setup'
    );

    // hook + commit
    expect((await task('hook', 'install')).exitCode).toBe(0);
    await writeFile(join(repoDir, 'app.txt'), 'hello\n');
    await git.add('app.txt');
    // フックから task(シム)を呼べるよう PATH を指定して git commit を実行する
    await execFileAsync('git', ['commit', '-m', 'Add app'], {
      cwd: repoDir,
      env: { ...process.env, PATH: env.PATH },
    });
    expect((await git.raw(['log', '-1', '--format=%B'])).trim()).toBe(
      'Add app\n\nTask: #2'
    );

    // done / archive
    expect((await task('done', '2')).stdout).toBe(
      '✓ タスク #2 を完了しました\n'
    );
    expect((await task('archive', '1')).stdout).toBe(
      '✓ タスク #1 をアーカイブしました\n'
    );
    const defaultList = await task('list');
    expect(defaultList.stdout).not.toContain('ユーザー認証');
    const allList = await task('list', '--all');
    expect(allList.stdout).toContain('1   archived');
    expect(allList.stdout).toContain('2   completed');

    // show
    const show = await task('show', '2');
    expect(show.stdout).toContain('ステータス  : completed');
    expect(show.stdout).toMatch(/完了日時 {4}: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('サブディレクトリから実行してもリポジトリルートのタスクを参照する', async () => {
    await runCli(['add', 'ルートで追加'], { cwd: repoDir });
    const subDir = join(repoDir, 'src');
    await mkdir(subDir);

    const result = await runCli(['list'], { cwd: subDir });

    expect(result.stdout).toContain('ルートで追加');
  });
});
