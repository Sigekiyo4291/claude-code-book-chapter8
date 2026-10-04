import type { TaskStatus } from '../domain/Task.js';
import { InvalidStatusTransitionError } from '../domain/errors.js';

export type TaskAction = 'start' | 'complete' | 'archive';

const TRANSITIONS: Readonly<
  Record<TaskAction, Partial<Record<TaskStatus, TaskStatus>>>
> = {
  start: { open: 'in_progress', completed: 'in_progress' },
  complete: { open: 'completed', in_progress: 'completed' },
  archive: {
    open: 'archived',
    in_progress: 'archived',
    completed: 'archived',
  },
};

const ARCHIVED_HINT =
  'アーカイブ済みのタスクは変更できません。task add で新しいタスクを作成してください';

/**
 * タスクのステータス遷移の可否を判定する。
 */
export class StatusTransitionPolicy {
  /**
   * @returns 遷移後のステータス
   * @throws {InvalidStatusTransitionError} 遷移できない場合
   */
  next(taskId: number, current: TaskStatus, action: TaskAction): TaskStatus {
    const nextStatus = TRANSITIONS[action][current];
    if (nextStatus === undefined) {
      throw new InvalidStatusTransitionError(
        taskId,
        current,
        buildHint(taskId, current)
      );
    }
    return nextStatus;
  }
}

function buildHint(taskId: number, current: TaskStatus): string | undefined {
  switch (current) {
    case 'in_progress':
      return `作業を終えたら task done ${taskId} を実行してください`;
    case 'completed':
      return `再開する場合は task start ${taskId} を実行してください`;
    case 'archived':
      return ARCHIVED_HINT;
    case 'open':
      return undefined;
  }
}
