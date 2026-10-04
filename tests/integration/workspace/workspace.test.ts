import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createContext } from '../../../src/cli/context.js';
import { NotGitRepositoryError } from '../../../src/domain/errors.js';
import {
  createTempDir,
  createTempGitRepo,
  removeTempDir,
} from '../../helpers/tempDir.js';

describe('ワークスペースの解決', () => {
  let dir: string;

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('サブディレクトリから実行しても、リポジトリルートの .task/ を使う', async () => {
    // Given
    dir = await createTempGitRepo();
    const subDir = join(dir, 'src', 'deep');
    await mkdir(subDir, { recursive: true });

    // When
    const context = await createContext(subDir);
    await context.taskService.createTask({ title: 'サブディレクトリから追加' });

    // Then
    expect(context.workspace).toEqual({
      rootDir: dir,
      dataDir: join(dir, '.task'),
      isGitRepository: true,
    });
    await expect(
      access(join(dir, '.task', 'tasks.json'))
    ).resolves.toBeUndefined();
    const fromRoot = await createContext(dir);
    const { tasks } = await fromRoot.taskService.listTasks({
      includeArchived: false,
    });
    expect(tasks.map((task) => task.title)).toEqual([
      'サブディレクトリから追加',
    ]);
  });

  it('Gitリポジトリ外ではカレントディレクトリを使い、基本操作と開始ができる', async () => {
    // Given
    dir = await createTempDir();
    const { workspace, taskService } = await createContext(dir);

    // When
    await taskService.createTask({ title: 'Git なし' });
    const result = await taskService.startTask(1);
    await taskService.completeTask(1);

    // Then
    expect(workspace.isGitRepository).toBe(false);
    expect(workspace.rootDir).toBe(dir);
    expect(result.branchAction).toBe('skipped_no_git');
    expect((await taskService.getTask(1)).status).toBe('completed');
  });

  it('Gitリポジトリ外ではフックをインストールできない', async () => {
    dir = await createTempDir();
    const { hookService } = await createContext(dir);

    await expect(hookService.install()).rejects.toThrow(NotGitRepositoryError);
  });

  it('git コマンドが見つからない環境でも基本操作ができる', async () => {
    dir = await createTempDir();
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
      const { workspace, taskService } = await createContext(dir);
      await taskService.createTask({ title: 'Git 未インストール' });

      expect(workspace.isGitRepository).toBe(false);
      expect(
        (await taskService.listTasks({ includeArchived: false })).tasks
      ).toHaveLength(1);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
