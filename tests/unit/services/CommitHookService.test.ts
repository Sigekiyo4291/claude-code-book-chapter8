import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/domain/Task.js';
import {
  HookConflictError,
  NotGitRepositoryError,
} from '../../../src/domain/errors.js';
import {
  CommitHookService,
  HOOK_SCRIPT,
} from '../../../src/services/CommitHookService.js';
import { FakeGit, InMemoryTextFiles } from '../../helpers/fakes.js';
import { buildTask } from '../../helpers/taskFactory.js';

const HOOKS_DIR = '/repo/.git/hooks';
const HOOK_PATH = `${HOOKS_DIR}/prepare-commit-msg`;
const MESSAGE_FILE = '/repo/.git/COMMIT_EDITMSG';

interface Setup {
  files?: Record<string, string>;
  currentBranch?: string;
  tasks?: Task[];
  isGitRepository?: boolean;
}

function setup(options: Setup = {}) {
  const files = new InMemoryTextFiles(options.files);
  const git = new FakeGit({
    hooksDir: HOOKS_DIR,
    currentBranch: options.currentBranch,
  });
  const tasks = options.tasks ?? [];
  const service = new CommitHookService({
    git,
    files,
    taskService: {
      findTaskByBranch: async (branch) =>
        tasks.find((task) => task.branch === branch),
    },
    isGitRepository: options.isGitRepository ?? true,
  });
  return { service, files };
}

describe('CommitHookService', () => {
  describe('install', () => {
    it('フックがない場合、実行可能なフックスクリプトを作成する', async () => {
      const { service, files } = setup();

      expect(await service.install()).toBe('installed');
      expect(files.files.get(HOOK_PATH)).toBe(HOOK_SCRIPT);
      expect(files.executables.has(HOOK_PATH)).toBe(true);
    });

    it('TaskCLI のフックが既にある場合、already_installed を返す', async () => {
      const { service } = setup({ files: { [HOOK_PATH]: HOOK_SCRIPT } });

      expect(await service.install()).toBe('already_installed');
    });

    it('別のフックがある場合、上書きせず HookConflictError を送出する', async () => {
      const original = '#!/bin/sh\necho custom\n';
      const { service, files } = setup({ files: { [HOOK_PATH]: original } });

      await expect(service.install()).rejects.toThrow(HookConflictError);
      expect(files.files.get(HOOK_PATH)).toBe(original);
    });

    it('Gitリポジトリ外の場合、NotGitRepositoryError を送出する', async () => {
      const { service } = setup({ isGitRepository: false });

      await expect(service.install()).rejects.toThrow(NotGitRepositoryError);
    });
  });

  describe('uninstall', () => {
    it('TaskCLI のフックを削除する', async () => {
      const { service, files } = setup({ files: { [HOOK_PATH]: HOOK_SCRIPT } });

      expect(await service.uninstall()).toBe('uninstalled');
      expect(files.files.has(HOOK_PATH)).toBe(false);
    });

    it('フックがない場合、not_installed を返す', async () => {
      const { service } = setup();

      expect(await service.uninstall()).toBe('not_installed');
    });

    it('別のフックは削除せず not_owned を返す', async () => {
      const { service, files } = setup({
        files: { [HOOK_PATH]: '#!/bin/sh\n' },
      });

      expect(await service.uninstall()).toBe('not_owned');
      expect(files.files.has(HOOK_PATH)).toBe(true);
    });
  });

  describe('appendTaskTrailer', () => {
    const linkedTask = buildTask({
      id: 1,
      branch: 'feature/task-1',
      status: 'in_progress',
    });

    it('現在のブランチに紐付くタスクがある場合、トレーラーを追記する', async () => {
      const { service, files } = setup({
        files: { [MESSAGE_FILE]: 'Add login endpoint\n' },
        currentBranch: 'feature/task-1',
        tasks: [linkedTask],
      });

      expect(await service.appendTaskTrailer(MESSAGE_FILE, 'message')).toBe(1);
      expect(files.files.get(MESSAGE_FILE)).toBe(
        'Add login endpoint\n\nTask: #1\n'
      );
    });

    it.each(['merge', 'squash', 'commit'])(
      'source が %s の場合、追記しない',
      async (source) => {
        const { service, files } = setup({
          files: { [MESSAGE_FILE]: 'Merge branch\n' },
          currentBranch: 'feature/task-1',
          tasks: [linkedTask],
        });

        expect(
          await service.appendTaskTrailer(MESSAGE_FILE, source)
        ).toBeUndefined();
        expect(files.files.get(MESSAGE_FILE)).toBe('Merge branch\n');
      }
    );

    it('現在のブランチがない(detached HEAD)場合、追記しない', async () => {
      const { service } = setup({
        files: { [MESSAGE_FILE]: 'msg\n' },
        tasks: [linkedTask],
      });

      expect(await service.appendTaskTrailer(MESSAGE_FILE)).toBeUndefined();
    });

    it('紐付くタスクがない場合、追記しない', async () => {
      const { service } = setup({
        files: { [MESSAGE_FILE]: 'msg\n' },
        currentBranch: 'main',
        tasks: [linkedTask],
      });

      expect(await service.appendTaskTrailer(MESSAGE_FILE)).toBeUndefined();
    });

    it('メッセージファイルがない場合、追記しない', async () => {
      const { service } = setup({
        currentBranch: 'feature/task-1',
        tasks: [linkedTask],
      });

      expect(await service.appendTaskTrailer(MESSAGE_FILE)).toBeUndefined();
    });

    it('既にトレーラーがある場合、ファイルを書き換えない', async () => {
      const { service, files } = setup({
        files: { [MESSAGE_FILE]: 'msg\n\nTask: #1\n' },
        currentBranch: 'feature/task-1',
        tasks: [linkedTask],
      });

      expect(await service.appendTaskTrailer(MESSAGE_FILE)).toBeUndefined();
      expect(files.files.get(MESSAGE_FILE)).toBe('msg\n\nTask: #1\n');
    });
  });
});
