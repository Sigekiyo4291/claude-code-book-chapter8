import { describe, expect, it } from 'vitest';
import { handleError } from '../../../src/cli/errorHandler.js';
import { createBufferedOutput } from '../../../src/cli/io/Output.js';
import { TaskNotFoundError } from '../../../src/domain/errors.js';

describe('handleError', () => {
  it('TaskCliError の場合、メッセージとヒントを標準エラー出力に表示し 1 を返す', () => {
    const output = createBufferedOutput();

    const exitCode = handleError(new TaskNotFoundError(5), output, false);

    expect(exitCode).toBe(1);
    expect(output.stderr).toBe(
      '✗ タスク #5 が見つかりません\n  task list --all で既存のタスクを確認できます\n'
    );
    expect(output.stdout).toBe('');
  });

  it('予期しないエラーの場合、汎用メッセージを表示しスタックトレースは表示しない', () => {
    const output = createBufferedOutput();

    const exitCode = handleError(new Error('boom'), output, false);

    expect(exitCode).toBe(1);
    expect(output.stderr).toContain('予期しないエラーが発生しました: boom');
    expect(output.stderr).toContain('TASKCLI_DEBUG=1');
    expect(output.stderr).not.toContain('at ');
  });

  it('debug の場合、スタックトレースを表示する', () => {
    const output = createBufferedOutput();

    handleError(new Error('boom'), output, true);

    expect(output.stderr).toContain('Error: boom\n');
  });

  it('Error 以外の値も表示できる', () => {
    const output = createBufferedOutput();

    handleError('string error', output, true);

    expect(output.stderr).toContain('string error');
  });
});
