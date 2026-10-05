import { TASK_STATUSES, type Task, type TaskStore } from '../domain/Task.js';

type UnknownRecord = Record<string, unknown>;

/**
 * 値が TaskStore の形式を満たすか検証し、問題があればその内容を返す。
 *
 * @returns 問題の説明。形式が正しければ undefined
 */
export function findTaskStoreProblem(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return 'ルートがオブジェクトではありません';
  }
  if (!isPositiveInteger(value.schemaVersion)) {
    return 'schemaVersion が正の整数ではありません';
  }
  if (!isPositiveInteger(value.nextId)) {
    return 'nextId が正の整数ではありません';
  }
  if (!Array.isArray(value.tasks)) {
    return 'tasks が配列ではありません';
  }

  const seenIds = new Set<number>();
  for (const [index, task] of value.tasks.entries()) {
    const problem = findTaskProblem(task);
    if (problem !== undefined) {
      return `tasks[${index}] の${problem}`;
    }
    if (!isTask(task)) {
      return `tasks[${index}] の形式が不正です`;
    }
    if (seenIds.has(task.id)) {
      return `タスクID ${task.id} が重複しています`;
    }
    if (task.id >= value.nextId) {
      return `nextId(${value.nextId})がタスクID ${task.id} 以下です`;
    }
    seenIds.add(task.id);
  }
  return undefined;
}

export function isTaskStore(value: unknown): value is TaskStore {
  return findTaskStoreProblem(value) === undefined;
}

function isTask(value: unknown): value is Task {
  return findTaskProblem(value) === undefined;
}

function findTaskProblem(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return '値がオブジェクトではありません';
  }
  if (!isPositiveInteger(value.id)) {
    return 'id が正の整数ではありません';
  }
  if (typeof value.title !== 'string') {
    return 'title が文字列ではありません';
  }
  if (!isOptionalString(value.description)) {
    return 'description が文字列ではありません';
  }
  if (!isTaskStatus(value.status)) {
    return 'status が不正です';
  }
  if (!isOptionalString(value.branch)) {
    return 'branch が文字列ではありません';
  }
  if (
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return 'createdAt / updatedAt が文字列ではありません';
  }
  if (!isOptionalString(value.completedAt)) {
    return 'completedAt が文字列ではありません';
  }
  return undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isTaskStatus(value: unknown): boolean {
  return TASK_STATUSES.some((status) => status === value);
}
