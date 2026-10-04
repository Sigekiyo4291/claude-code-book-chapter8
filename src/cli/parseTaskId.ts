import { ValidationError } from '../domain/errors.js';

const TASK_ID_PATTERN = /^#?([1-9]\d*)$/;

/**
 * CLI 引数のタスクID(`1` または `#1`)を正の整数に変換する。
 *
 * @throws {ValidationError} 正の整数として解釈できない場合
 */
export function parseTaskId(rawId: string): number {
  const match = TASK_ID_PATTERN.exec(rawId.trim());
  const id = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(id)) {
    throw new ValidationError(
      `タスクIDは正の整数で指定してください: ${rawId}`,
      'task list でタスクIDを確認できます'
    );
  }
  return id;
}
