import { TASK_STATUSES, type TaskStatus } from '../domain/Task.js';
import { ValidationError } from '../domain/errors.js';

const VALID_STATUSES_HINT = `有効な値: ${TASK_STATUSES.join(', ')}`;

/**
 * `--status` の値(`open,in_progress` 形式)をステータスの配列に変換する。
 * 前後の空白と空要素は無視し、重複は除去する。
 *
 * @throws {ValidationError} 不正なステータスを含む場合、またはステータスが1つもない場合
 */
export function parseStatusFilter(rawStatuses: string): TaskStatus[] {
  const statuses = new Set<TaskStatus>();
  for (const rawStatus of rawStatuses.split(',')) {
    const status = rawStatus.trim();
    if (status === '') {
      continue;
    }
    if (!isTaskStatus(status)) {
      throw new ValidationError(
        `不正なステータスです: ${status}`,
        VALID_STATUSES_HINT
      );
    }
    statuses.add(status);
  }
  if (statuses.size === 0) {
    throw new ValidationError(
      'ステータスを指定してください',
      VALID_STATUSES_HINT
    );
  }
  return [...statuses];
}

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value);
}
