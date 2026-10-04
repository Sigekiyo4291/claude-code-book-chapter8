import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import { createTempDir, removeTempDir } from '../helpers/tempDir.js';

describe('削除の確認プロンプト(E2E)', () => {
  let dir: string;
  const task = (args: string[], input?: string) =>
    runCli(args, { cwd: dir, input });

  beforeEach(async () => {
    dir = await createTempDir();
    await task(['add', '消すかもしれないタスク']);
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('y と入力した場合、削除する', async () => {
    const result = await task(['delete', '1'], 'y\n');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'タスク #1「消すかもしれないタスク」を削除しますか? [y/N]'
    );
    expect(result.stdout).toContain('✓ タスク #1 を削除しました');
    expect((await task(['list'])).stdout).toContain('タスクがありません');
  });

  it.each([['n\n'], ['\n']])(
    '%j と入力した場合、キャンセルする',
    async (input) => {
      const result = await task(['delete', '1'], input);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('削除をキャンセルしました');
      expect((await task(['show', '1'])).exitCode).toBe(0);
    }
  );

  it('入力がない場合、削除せず --force を案内する', async () => {
    const result = await task(['delete', '1'], '');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--force を指定してください');
    expect((await task(['show', '1'])).exitCode).toBe(0);
  });

  it('--force の場合、確認せずに削除し、IDを再利用しない', async () => {
    const result = await task(['delete', '1', '--force']);
    const added = await task(['add', '次のタスク']);

    expect(result.stdout).toBe('✓ タスク #1 を削除しました\n');
    expect(added.stdout).toContain('タスク #2 を作成しました');
  });
});
