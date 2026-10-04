import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContext } from '../../../src/cli/context.js';
import { HookConflictError } from '../../../src/domain/errors.js';
import { HOOK_SCRIPT } from '../../../src/services/CommitHookService.js';
import { createTempGitRepo, removeTempDir } from '../../helpers/tempDir.js';

describe('コミットフック(実Git)', () => {
  let repoDir: string;
  const hookPath = () => join(repoDir, '.git', 'hooks', 'prepare-commit-msg');

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await removeTempDir(repoDir);
  });

  it('.git/hooks に実行可能なフックをインストールする', async () => {
    const { hookService } = await createContext(repoDir);

    expect(await hookService.install()).toBe('installed');

    expect(await readFile(hookPath(), 'utf8')).toBe(HOOK_SCRIPT);
    if (process.platform !== 'win32') {
      expect((await stat(hookPath())).mode & 0o111).not.toBe(0);
    }
  });

  it('core.hooksPath が設定されている場合、そのディレクトリにインストールする', async () => {
    await simpleGit({
      baseDir: repoDir,
      unsafe: { allowUnsafeHooksPath: true },
    }).addConfig('core.hooksPath', 'custom-hooks');
    const { hookService } = await createContext(repoDir);

    await hookService.install();

    expect(
      await readFile(
        join(repoDir, 'custom-hooks', 'prepare-commit-msg'),
        'utf8'
      )
    ).toBe(HOOK_SCRIPT);
  });

  it('既存のフックは上書きしない', async () => {
    await writeFile(hookPath(), '#!/bin/sh\necho mine\n');
    const { hookService } = await createContext(repoDir);

    await expect(hookService.install()).rejects.toThrow(HookConflictError);
    expect(await readFile(hookPath(), 'utf8')).toBe('#!/bin/sh\necho mine\n');
  });

  it('タスクのブランチ上ではコミットメッセージにトレーラーを追記する', async () => {
    // Given
    const { taskService, hookService } = await createContext(repoDir);
    await taskService.createTask({ title: 'Login' });
    await taskService.startTask(1);
    const messageFile = join(repoDir, '.git', 'COMMIT_EDITMSG');
    await writeFile(messageFile, 'Add login endpoint\n');

    // When
    const appended = await hookService.appendTaskTrailer(
      messageFile,
      'message'
    );

    // Then
    expect(appended).toBe(1);
    expect(await readFile(messageFile, 'utf8')).toBe(
      'Add login endpoint\n\nTask: #1\n'
    );
  });

  it('main ブランチ上では追記しない', async () => {
    const { taskService, hookService } = await createContext(repoDir);
    await taskService.createTask({ title: 'Login' });
    const messageFile = join(repoDir, '.git', 'COMMIT_EDITMSG');
    await writeFile(messageFile, 'msg\n');

    expect(
      await hookService.appendTaskTrailer(messageFile, 'message')
    ).toBeUndefined();
  });
});
