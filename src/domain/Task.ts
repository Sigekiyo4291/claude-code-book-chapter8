export const TASK_STATUSES = [
  'open',
  'in_progress',
  'completed',
  'archived',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const BRANCH_PREFIX = 'feature/task-';
export const MAX_SLUG_LENGTH = 50;
export const CURRENT_SCHEMA_VERSION = 1;
export const DATA_DIR_NAME = '.task';
export const TASKS_FILE_NAME = 'tasks.json';
export const TRAILER_KEY = 'Task';

/**
 * 利用者が管理する作業の単位。
 */
export interface Task {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  readonly branch?: string;
  /** ISO 8601(UTC) */
  readonly createdAt: string;
  /** ISO 8601(UTC) */
  readonly updatedAt: string;
  /** ISO 8601(UTC)。最後に完了した日時 */
  readonly completedAt?: string;
}

/**
 * tasks.json の内容全体。
 */
export interface TaskStore {
  readonly schemaVersion: number;
  readonly nextId: number;
  readonly tasks: readonly Task[];
}

/**
 * タスクデータを配置する場所と、Gitリポジトリ内かどうかの情報。
 */
export interface Workspace {
  readonly rootDir: string;
  readonly dataDir: string;
  readonly isGitRepository: boolean;
}

export function createEmptyStore(): TaskStore {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, nextId: 1, tasks: [] };
}
