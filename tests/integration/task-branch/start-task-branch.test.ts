import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContext } from '../../../src/cli/context.js';
import { GitOperationError } from '../../../src/domain/errors.js';
import { createTempGitRepo, removeTempDir } from '../../helpers/tempDir.js';

describe('task start(実Git)', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await removeTempDir(repoDir);
  });

  it('新しいブランチを作成してチェックアウトし、タスクに記録する', async () => {
    // Given
    const { taskService } = await createContext(repoDir);
    const task = await taskService.createTask({ title: 'Initial setup' });

    // When
    const result = await taskService.startTask(task.id);

    // Then
    expect(result.branchAction).toBe('created');
    const branch = await simpleGit(repoDir).revparse(['--abbrev-ref', 'HEAD']);
    expect(branch).toBe('feature/task-1-initial-setup');
    expect((await taskService.getTask(1)).branch).toBe(
      'feature/task-1-initial-setup'
    );
  });

  it('既存のブランチがある場合、作成せずに切り替える', async () => {
    const git = simpleGit(repoDir);
    await git.branch(['feature/task-1']);
    const { taskService } = await createContext(repoDir);
    await taskService.createTask({ title: 'ユーザー認証' });

    const result = await taskService.startTask(1);

    expect(result.branchAction).toBe('switched');
    expect(await git.revparse(['--abbrev-ref', 'HEAD'])).toBe('feature/task-1');
  });

  it('未コミットの変更で切り替えに失敗した場合、タスクを変更しない', async () => {
    // Given: 切り替え先のブランチで README.md を変更し、作業ツリーにも競合する変更を置く
    const git = simpleGit(repoDir);
    await git.checkoutLocalBranch('feature/task-1');
    await writeFile(join(repoDir, 'README.md'), 'branch change\n');
    await git.commit('change on branch', ['README.md']);
    await git.checkout('main');
    await writeFile(join(repoDir, 'README.md'), 'uncommitted change\n');
    const { taskService } = await createContext(repoDir);
    await taskService.createTask({ title: 'タスク' });

    // When
    const promise = taskService.startTask(1);

    // Then
    await expect(promise).rejects.toThrow(GitOperationError);
    const task = await taskService.getTask(1);
    expect(task.status).toBe('open');
    expect(task.branch).toBeUndefined();
    expect(await git.revparse(['--abbrev-ref', 'HEAD'])).toBe('main');
  });

  it('Gitで無効なブランチ名を指定した場合、拒否する', async () => {
    const { taskService } = await createContext(repoDir);
    await taskService.createTask({ title: 'タスク' });

    await expect(
      taskService.startTask(1, { branch: 'foo..bar' })
    ).rejects.toThrow('ブランチ名 "foo..bar" はGitで使用できません');
  });

  it('@{-1} のように別のブランチ名に展開される名前は拒否する', async () => {
    const { taskService } = await createContext(repoDir);
    await taskService.createTask({ title: 'タスク' });

    await expect(taskService.startTask(1, { branch: '@{-1}' })).rejects.toThrow(
      'ブランチ名 "@{-1}" はGitで使用できません'
    );
  });
});
