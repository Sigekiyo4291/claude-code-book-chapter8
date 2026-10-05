import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type Task,
  type TaskStatus,
  type TaskStore,
  type Workspace,
} from '../domain/Task.js';
import { TaskNotFoundError, ValidationError } from '../domain/errors.js';
import type { BranchNameGenerator } from './BranchNameGenerator.js';
import type { Clock } from './Clock.js';
import { matchesKeywords, splitKeywords } from './matchKeywords.js';
import type { GitPort, TaskRepositoryPort } from './ports.js';
import type {
  StatusTransitionPolicy,
  TaskAction,
} from './StatusTransitionPolicy.js';

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export interface ListOptions {
  includeArchived: boolean;
  /**
   * 指定した場合、このステータスのタスクのみ返す。
   * archived を含む場合は includeArchived に関係なくアーカイブ済みも返す
   * 空配列は未指定として扱う
   */
  statuses?: readonly TaskStatus[];
}

export interface ListResult {
  tasks: Task[];
  /** 一覧から除外したアーカイブ済みタスクの件数 */
  hiddenArchivedCount: number;
}

export interface StartTaskOptions {
  branch?: string;
}

export type BranchAction = 'created' | 'switched' | 'skipped_no_git';

export interface StartTaskResult {
  task: Task;
  branchAction: BranchAction;
}

export interface TaskServiceDependencies {
  repository: TaskRepositoryPort;
  git: GitPort;
  workspace: Pick<Workspace, 'isGitRepository'>;
  policy: StatusTransitionPolicy;
  branchNameGenerator: BranchNameGenerator;
  clock: Clock;
}

/**
 * タスクの作成・取得・一覧・削除と、ステータス変更を行う。
 */
export class TaskService {
  constructor(private readonly deps: TaskServiceDependencies) {}

  /**
   * .task/ ディレクトリと tasks.json を作成する。
   */
  async initialize(): Promise<'created' | 'already_exists'> {
    return this.deps.repository.initialize();
  }

  /**
   * @throws {ValidationError} タイトル・説明が不正な場合
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    const title = normalizeTitle(input.title);
    const description = normalizeDescription(input.description);

    const store = await this.deps.repository.load();
    const now = this.deps.clock.now();
    const task: Task = {
      id: store.nextId,
      title,
      ...(description === undefined ? {} : { description }),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save({
      ...store,
      nextId: store.nextId + 1,
      tasks: [...store.tasks, task],
    });
    return task;
  }

  /**
   * @throws {TaskNotFoundError} タスクが存在しない場合
   */
  async getTask(id: number): Promise<Task> {
    const store = await this.deps.repository.load();
    return findTaskOrThrow(store, id);
  }

  async listTasks(options: ListOptions): Promise<ListResult> {
    return this.queryTasks(() => true, options);
  }

  /**
   * タイトルまたは説明に、空白区切りのキーワードをすべて含むタスクを返す。
   * 大文字小文字・全角半角は区別しない。
   *
   * @throws {ValidationError} キーワードが空の場合
   */
  async searchTasks(
    keyword: string,
    options: ListOptions
  ): Promise<ListResult> {
    const keywords = splitKeywords(keyword);
    if (keywords.length === 0) {
      throw new ValidationError(
        '検索キーワードを指定してください',
        '例: task search 認証'
      );
    }
    return this.queryTasks((task) => matchesKeywords(task, keywords), options);
  }

  /**
   * タスクを削除する。削除したIDは再利用しない。
   *
   * @returns 削除したタスク
   * @throws {TaskNotFoundError} タスクが存在しない場合
   */
  async deleteTask(id: number): Promise<Task> {
    const store = await this.deps.repository.load();
    const task = findTaskOrThrow(store, id);
    await this.deps.repository.save({
      ...store,
      tasks: store.tasks.filter((candidate) => candidate.id !== id),
    });
    return task;
  }

  /**
   * タスクを開始し、紐付くブランチを作成または切り替える。
   * Git操作が成功した場合のみタスクを保存するため、失敗時にタスクは変更されない。
   *
   * @throws {TaskNotFoundError} タスクが存在しない場合
   * @throws {InvalidStatusTransitionError} 開始できないステータスの場合
   * @throws {InvalidBranchNameError} 指定したブランチ名が不正な場合
   * @throws {GitOperationError} ブランチの作成・切り替えに失敗した場合
   */
  async startTask(
    id: number,
    options: StartTaskOptions = {}
  ): Promise<StartTaskResult> {
    const store = await this.deps.repository.load();
    const task = findTaskOrThrow(store, id);
    const nextStatus = this.deps.policy.next(id, task.status, 'start');

    if (!this.deps.workspace.isGitRepository) {
      const updated = await this.saveTask(store, task, { status: nextStatus });
      return { task: updated, branchAction: 'skipped_no_git' };
    }

    const branch = await this.resolveBranchName(task, options);
    const branchAction = await this.checkoutBranch(branch);
    const updated = await this.saveTask(store, task, {
      status: nextStatus,
      branch,
    });
    return { task: updated, branchAction };
  }

  /**
   * @throws {TaskNotFoundError} タスクが存在しない場合
   * @throws {InvalidStatusTransitionError} 完了できないステータスの場合
   */
  async completeTask(id: number): Promise<Task> {
    return this.transition(id, 'complete');
  }

  /**
   * @throws {TaskNotFoundError} タスクが存在しない場合
   * @throws {InvalidStatusTransitionError} 既にアーカイブ済みの場合
   */
  async archiveTask(id: number): Promise<Task> {
    return this.transition(id, 'archive');
  }

  /**
   * ブランチに紐付く、アーカイブ済み以外のタスクを探す。
   * 複数ある場合は作業中のタスク、次にIDが大きいタスクを優先する。
   */
  async findTaskByBranch(branch: string): Promise<Task | undefined> {
    const store = await this.deps.repository.load();
    const candidates = store.tasks
      .filter((task) => task.branch === branch && task.status !== 'archived')
      .sort((a, b) => b.id - a.id);
    return (
      candidates.find((task) => task.status === 'in_progress') ?? candidates[0]
    );
  }

  private async queryTasks(
    predicate: (task: Task) => boolean,
    options: ListOptions
  ): Promise<ListResult> {
    const store = await this.deps.repository.load();
    const matched = store.tasks.filter(predicate).sort((a, b) => a.id - b.id);

    const { statuses } = options;
    if (statuses !== undefined && statuses.length > 0) {
      // ステータスを明示的に選んでいるため、アーカイブ済みの除外件数は案内しない
      return {
        tasks: matched.filter((task) => statuses.includes(task.status)),
        hiddenArchivedCount: 0,
      };
    }
    if (options.includeArchived) {
      return { tasks: matched, hiddenArchivedCount: 0 };
    }
    const visible = matched.filter((task) => task.status !== 'archived');
    return {
      tasks: visible,
      hiddenArchivedCount: matched.length - visible.length,
    };
  }

  private async transition(id: number, action: TaskAction): Promise<Task> {
    const store = await this.deps.repository.load();
    const task = findTaskOrThrow(store, id);
    const status = this.deps.policy.next(id, task.status, action);
    return this.saveTask(store, task, { status });
  }

  private async resolveBranchName(
    task: Task,
    options: StartTaskOptions
  ): Promise<string> {
    if (options.branch !== undefined) {
      await this.deps.branchNameGenerator.validate(options.branch);
      return options.branch;
    }
    return (
      task.branch ?? this.deps.branchNameGenerator.generate(task.id, task.title)
    );
  }

  private async checkoutBranch(branch: string): Promise<BranchAction> {
    if (await this.deps.git.branchExists(branch)) {
      await this.deps.git.checkoutBranch(branch);
      return 'switched';
    }
    await this.deps.git.createAndCheckoutBranch(branch);
    return 'created';
  }

  private async saveTask(
    store: TaskStore,
    task: Task,
    changes: { status: TaskStatus; branch?: string }
  ): Promise<Task> {
    const now = this.deps.clock.now();
    const updated: Task = {
      ...task,
      ...changes,
      updatedAt: now,
      ...(changes.status === 'completed' ? { completedAt: now } : {}),
    };
    await this.deps.repository.save({
      ...store,
      tasks: store.tasks.map((candidate) =>
        candidate.id === task.id ? updated : candidate
      ),
    });
    return updated;
  }
}

function findTaskOrThrow(store: TaskStore, id: number): Task {
  const task = store.tasks.find((candidate) => candidate.id === id);
  if (task === undefined) {
    throw new TaskNotFoundError(id);
  }
  return task;
}

function normalizeTitle(rawTitle: string): string {
  // タイトルは一覧で1行に表示するため、改行を空白に置き換える
  const title = rawTitle.replace(/\r\n|\r|\n/g, ' ').trim();
  const length = [...title].length;
  if (length === 0 || length > TITLE_MAX_LENGTH) {
    throw new ValidationError(
      `タイトルは1〜${TITLE_MAX_LENGTH}文字で入力してください(現在: ${length}文字)`
    );
  }
  return title;
}

function normalizeDescription(
  rawDescription: string | undefined
): string | undefined {
  if (rawDescription === undefined || rawDescription.trim() === '') {
    return undefined;
  }
  const length = [...rawDescription].length;
  if (length > DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(
      `説明は${DESCRIPTION_MAX_LENGTH}文字以内で入力してください(現在: ${length}文字)`
    );
  }
  return rawDescription;
}
