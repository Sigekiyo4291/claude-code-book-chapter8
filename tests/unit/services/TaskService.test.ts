import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/domain/Task.js';
import {
  GitOperationError,
  InvalidBranchNameError,
  InvalidStatusTransitionError,
  TaskNotFoundError,
  ValidationError,
} from '../../../src/domain/errors.js';
import { BranchNameGenerator } from '../../../src/services/BranchNameGenerator.js';
import { StatusTransitionPolicy } from '../../../src/services/StatusTransitionPolicy.js';
import { TaskService } from '../../../src/services/TaskService.js';
import {
  FakeGit,
  FixedClock,
  InMemoryTaskRepository,
  type FakeGitOptions,
} from '../../helpers/fakes.js';
import { buildTask } from '../../helpers/taskFactory.js';

const NOW = '2026-10-03T01:00:00.000Z';

interface Setup {
  tasks?: Task[];
  nextId?: number;
  git?: FakeGitOptions;
  isGitRepository?: boolean;
}

function setup(options: Setup = {}) {
  const repository = new InMemoryTaskRepository(
    options.tasks ?? [],
    options.nextId
  );
  const git = new FakeGit(options.git);
  const service = new TaskService({
    repository,
    git,
    workspace: { isGitRepository: options.isGitRepository ?? true },
    policy: new StatusTransitionPolicy(),
    branchNameGenerator: new BranchNameGenerator(git),
    clock: new FixedClock(NOW),
  });
  return { service, repository, git };
}

describe('TaskService', () => {
  describe('initialize', () => {
    it('リポジトリの初期化結果を返す', async () => {
      const { service } = setup();

      expect(await service.initialize()).toBe('created');
      expect(await service.initialize()).toBe('already_exists');
    });
  });

  describe('createTask', () => {
    it('正常なタイトルの場合、ID 1 の open のタスクを作成し保存する', async () => {
      // Given
      const { service, repository } = setup();

      // When
      const task = await service.createTask({
        title: 'ユーザー認証機能の実装',
      });

      // Then
      expect(task).toEqual({
        id: 1,
        title: 'ユーザー認証機能の実装',
        status: 'open',
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(repository.store.tasks).toEqual([task]);
      expect(repository.store.nextId).toBe(2);
    });

    it('説明を指定した場合、説明を保存する', async () => {
      const { service } = setup();

      const task = await service.createTask({
        title: 'ログイン画面',
        description: 'メールとパスワードでログイン',
      });

      expect(task.description).toBe('メールとパスワードでログイン');
    });

    it('空白のみの説明は保存しない', async () => {
      const { service } = setup();

      const task = await service.createTask({ title: 't', description: '  ' });

      expect(task).not.toHaveProperty('description');
    });

    it('タイトルの前後の空白を除去し、改行を空白に置き換える', async () => {
      const { service } = setup();

      const task = await service.createTask({
        title: '  一行目\n二行目\r\n三行目  ',
      });

      expect(task.title).toBe('一行目 二行目 三行目');
    });

    it('削除済みのIDを再利用せず nextId から採番する', async () => {
      const { service } = setup({ tasks: [buildTask({ id: 1 })], nextId: 5 });

      const task = await service.createTask({ title: '新しいタスク' });

      expect(task.id).toBe(5);
    });

    it.each([
      ['空文字', ''],
      ['空白のみ', '   '],
      ['201文字', 'あ'.repeat(201)],
    ])(
      'タイトルが%sの場合、ValidationError を送出し保存しない',
      async (_, title) => {
        const { service, repository } = setup();

        await expect(service.createTask({ title })).rejects.toThrow(
          ValidationError
        );
        expect(repository.saveCount).toBe(0);
      }
    );

    it('タイトルが200文字ちょうど(絵文字を含む)の場合、作成できる', async () => {
      const { service } = setup();
      const title = `${'あ'.repeat(199)}😀`;

      const task = await service.createTask({ title });

      expect(task.title).toBe(title);
    });

    it('説明が10,000文字を超える場合、ValidationError を送出する', async () => {
      const { service } = setup();

      await expect(
        service.createTask({ title: 't', description: 'a'.repeat(10_001) })
      ).rejects.toThrow('説明は10000文字以内');
    });
  });

  describe('getTask', () => {
    it('存在するIDの場合、タスクを返す', async () => {
      const task = buildTask({ id: 2 });
      const { service } = setup({ tasks: [task] });

      expect(await service.getTask(2)).toEqual(task);
    });

    it('存在しないIDの場合、TaskNotFoundError を送出する', async () => {
      const { service } = setup();

      await expect(service.getTask(99)).rejects.toThrow(TaskNotFoundError);
      await expect(service.getTask(99)).rejects.toThrow(
        'タスク #99 が見つかりません'
      );
    });
  });

  describe('listTasks', () => {
    const tasks = [
      buildTask({ id: 3, status: 'completed' }),
      buildTask({ id: 1 }),
      buildTask({ id: 2, status: 'archived' }),
    ];

    it('アーカイブ済みを除いて ID 昇順で返し、除外件数を返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.listTasks({ includeArchived: false });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 3]);
      expect(result.hiddenArchivedCount).toBe(1);
    });

    it('includeArchived の場合、全タスクを返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.listTasks({ includeArchived: true });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 2, 3]);
      expect(result.hiddenArchivedCount).toBe(0);
    });

    it('statuses を指定した場合、そのステータスのみ返し、除外件数は 0 とする', async () => {
      const { service } = setup({ tasks });

      const result = await service.listTasks({
        includeArchived: false,
        statuses: ['open', 'completed'],
      });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 3]);
      expect(result.hiddenArchivedCount).toBe(0);
    });

    it('statuses に archived を含む場合、includeArchived なしでも返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.listTasks({
        includeArchived: false,
        statuses: ['archived'],
      });

      expect(result.tasks.map((task) => task.id)).toEqual([2]);
    });

    it('statuses が空配列の場合、未指定として扱う', async () => {
      const { service } = setup({ tasks });

      const result = await service.listTasks({
        includeArchived: false,
        statuses: [],
      });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 3]);
      expect(result.hiddenArchivedCount).toBe(1);
    });
  });

  describe('searchTasks', () => {
    const tasks = [
      buildTask({ id: 1, title: 'ユーザー認証の実装' }),
      buildTask({
        id: 2,
        title: 'ログイン画面',
        description: 'API 認証を呼ぶ',
      }),
      buildTask({ id: 3, title: '認証ログの整理', status: 'archived' }),
      buildTask({ id: 4, title: 'README 更新', status: 'completed' }),
    ];

    it('タイトルまたは説明にキーワードを含むタスクを ID 昇順で返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.searchTasks('認証', {
        includeArchived: false,
      });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 2]);
      expect(result.hiddenArchivedCount).toBe(1);
    });

    it('複数キーワードはすべてを含むタスクのみ返し、全角英字も一致する', async () => {
      const { service } = setup({ tasks });

      const result = await service.searchTasks('認証　ａｐｉ', {
        includeArchived: false,
      });

      expect(result.tasks.map((task) => task.id)).toEqual([2]);
    });

    it('includeArchived の場合、アーカイブ済みも返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.searchTasks('認証', {
        includeArchived: true,
      });

      expect(result.tasks.map((task) => task.id)).toEqual([1, 2, 3]);
      expect(result.hiddenArchivedCount).toBe(0);
    });

    it('statuses と併用できる', async () => {
      const { service } = setup({ tasks });

      const result = await service.searchTasks('readme', {
        includeArchived: false,
        statuses: ['completed'],
      });

      expect(result.tasks.map((task) => task.id)).toEqual([4]);
    });

    it('一致しない場合、空の結果を返す', async () => {
      const { service } = setup({ tasks });

      const result = await service.searchTasks('存在しない', {
        includeArchived: false,
      });

      expect(result).toEqual({ tasks: [], hiddenArchivedCount: 0 });
    });

    it('キーワードが空白のみの場合、ValidationError を送出する', async () => {
      const { service } = setup({ tasks });

      await expect(
        service.searchTasks('  ', { includeArchived: false })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteTask', () => {
    it('タスクを削除し、nextId は変えない', async () => {
      const { service, repository } = setup({
        tasks: [buildTask({ id: 1 }), buildTask({ id: 2 })],
      });

      const deleted = await service.deleteTask(2);

      expect(deleted.id).toBe(2);
      expect(repository.store.tasks.map((task) => task.id)).toEqual([1]);
      expect(repository.store.nextId).toBe(3);
    });

    it('存在しないIDの場合、TaskNotFoundError を送出する', async () => {
      const { service } = setup();

      await expect(service.deleteTask(1)).rejects.toThrow(TaskNotFoundError);
    });
  });

  describe('startTask', () => {
    it('ブランチが存在しない場合、生成した名前で作成して in_progress にする', async () => {
      // Given
      const { service, repository, git } = setup({
        tasks: [buildTask({ id: 3, title: 'Initial setup' })],
      });

      // When
      const result = await service.startTask(3);

      // Then
      expect(result.branchAction).toBe('created');
      expect(git.calls).toEqual(['checkout -b feature/task-3-initial-setup']);
      expect(result.task).toMatchObject({
        status: 'in_progress',
        branch: 'feature/task-3-initial-setup',
        updatedAt: NOW,
      });
      expect(repository.store.tasks[0]).toEqual(result.task);
    });

    it('ブランチが既に存在する場合、作成せずに切り替える', async () => {
      const { service, git } = setup({
        tasks: [buildTask({ id: 1, title: 'ユーザー認証' })],
        git: { branches: ['main', 'feature/task-1'] },
      });

      const result = await service.startTask(1);

      expect(result.branchAction).toBe('switched');
      expect(git.calls).toEqual(['checkout feature/task-1']);
    });

    it('--branch を指定した場合、そのブランチ名を使う', async () => {
      const { service } = setup({ tasks: [buildTask({ id: 1 })] });

      const result = await service.startTask(1, { branch: 'fix/login-bug' });

      expect(result.task.branch).toBe('fix/login-bug');
    });

    it('不正なブランチ名を指定した場合、Git操作も保存もせずに InvalidBranchNameError を送出する', async () => {
      const { service, repository, git } = setup({
        tasks: [buildTask({ id: 1 })],
      });

      await expect(service.startTask(1, { branch: '--force' })).rejects.toThrow(
        InvalidBranchNameError
      );
      expect(git.calls).toEqual([]);
      expect(repository.saveCount).toBe(0);
    });

    it('完了済みタスクを再開する場合、記録済みのブランチに切り替える', async () => {
      const { service, git } = setup({
        tasks: [
          buildTask({
            id: 4,
            status: 'completed',
            branch: 'feature/task-4-old',
            completedAt: '2026-10-02T00:00:00.000Z',
          }),
        ],
        git: { branches: ['main', 'feature/task-4-old'] },
      });

      const result = await service.startTask(4);

      expect(git.calls).toEqual(['checkout feature/task-4-old']);
      expect(result.task.status).toBe('in_progress');
      expect(result.task.completedAt).toBe('2026-10-02T00:00:00.000Z');
    });

    it('ブランチの切り替えに失敗した場合、タスクを変更しない', async () => {
      // Given
      const { service, repository } = setup({
        tasks: [buildTask({ id: 1 })],
        git: { failCheckout: true },
      });

      // When
      const promise = service.startTask(1);

      // Then
      await expect(promise).rejects.toThrow(GitOperationError);
      expect(repository.saveCount).toBe(0);
      expect(repository.store.tasks[0]?.status).toBe('open');
    });

    it('Gitリポジトリ外の場合、ブランチ操作をせずステータスのみ変更する', async () => {
      const { service, git } = setup({
        tasks: [buildTask({ id: 1 })],
        isGitRepository: false,
      });

      const result = await service.startTask(1);

      expect(result.branchAction).toBe('skipped_no_git');
      expect(result.task.status).toBe('in_progress');
      expect(result.task).not.toHaveProperty('branch');
      expect(git.calls).toEqual([]);
    });

    it('作業中のタスクの場合、InvalidStatusTransitionError を送出し Git 操作をしない', async () => {
      const { service, git } = setup({
        tasks: [buildTask({ id: 1, status: 'in_progress' })],
      });

      await expect(service.startTask(1)).rejects.toThrow(
        InvalidStatusTransitionError
      );
      expect(git.calls).toEqual([]);
    });
  });

  describe('completeTask', () => {
    it('作業中のタスクを completed にし、完了日時を記録する', async () => {
      const { service } = setup({
        tasks: [buildTask({ id: 1, status: 'in_progress' })],
      });

      const task = await service.completeTask(1);

      expect(task).toMatchObject({
        status: 'completed',
        completedAt: NOW,
        updatedAt: NOW,
      });
    });

    it('完了済みのタスクの場合、InvalidStatusTransitionError を送出する', async () => {
      const { service } = setup({
        tasks: [buildTask({ id: 1, status: 'completed' })],
      });

      await expect(service.completeTask(1)).rejects.toThrow(
        'タスク #1 は既に完了しています(completed)'
      );
    });
  });

  describe('archiveTask', () => {
    it('タスクを archived にし、完了日時は設定しない', async () => {
      const { service } = setup({ tasks: [buildTask({ id: 1 })] });

      const task = await service.archiveTask(1);

      expect(task.status).toBe('archived');
      expect(task).not.toHaveProperty('completedAt');
    });

    it('存在しないIDの場合、TaskNotFoundError を送出する', async () => {
      const { service } = setup();

      await expect(service.archiveTask(1)).rejects.toThrow(TaskNotFoundError);
    });
  });

  describe('findTaskByBranch', () => {
    it('ブランチに紐付くタスクのうち作業中のものを優先して返す', async () => {
      const { service } = setup({
        tasks: [
          buildTask({ id: 1, branch: 'shared', status: 'in_progress' }),
          buildTask({ id: 2, branch: 'shared', status: 'completed' }),
        ],
      });

      expect((await service.findTaskByBranch('shared'))?.id).toBe(1);
    });

    it('作業中のものがなければIDが大きいタスクを返す', async () => {
      const { service } = setup({
        tasks: [
          buildTask({ id: 1, branch: 'shared', status: 'completed' }),
          buildTask({ id: 2, branch: 'shared', status: 'open' }),
        ],
      });

      expect((await service.findTaskByBranch('shared'))?.id).toBe(2);
    });

    it('アーカイブ済みのタスクは対象外とする', async () => {
      const { service } = setup({
        tasks: [buildTask({ id: 1, branch: 'b', status: 'archived' })],
      });

      expect(await service.findTaskByBranch('b')).toBeUndefined();
    });
  });
});
