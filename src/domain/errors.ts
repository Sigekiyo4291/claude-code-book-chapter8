import type { TaskStatus } from './Task.js';

/**
 * 利用者の操作で起こり得るエラーの基底クラス。
 * message は「何が起きたか」、hint は「どうすれば解決できるか」を表す。
 */
export abstract class TaskCliError extends Error {
  abstract readonly hint?: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends TaskCliError {
  constructor(
    message: string,
    readonly hint?: string
  ) {
    super(message);
  }
}

export class TaskNotFoundError extends TaskCliError {
  readonly hint = 'task list --all で既存のタスクを確認できます';

  constructor(readonly taskId: number) {
    super(`タスク #${taskId} が見つかりません`);
  }
}

const STATUS_MESSAGES: Record<TaskStatus, string> = {
  open: '未着手です',
  in_progress: '既に作業中です',
  completed: '既に完了しています',
  archived: '既にアーカイブされています',
};

export class InvalidStatusTransitionError extends TaskCliError {
  constructor(
    readonly taskId: number,
    readonly status: TaskStatus,
    readonly hint?: string
  ) {
    super(`タスク #${taskId} は${STATUS_MESSAGES[status]}(${status})`);
  }
}

export class InvalidBranchNameError extends TaskCliError {
  readonly hint = '英数字・ハイフン・スラッシュで指定してください';

  constructor(readonly branchName: string) {
    super(`ブランチ名 "${branchName}" はGitで使用できません`);
  }
}

export class GitOperationError extends TaskCliError {
  constructor(
    message: string,
    readonly gitOutput: string,
    readonly hint?: string
  ) {
    super(gitOutput === '' ? message : `${message}\n${gitOutput}`);
  }
}

export class NotGitRepositoryError extends TaskCliError {
  readonly hint = 'Gitリポジトリ内で実行してください';

  constructor() {
    super('Gitリポジトリではありません');
  }
}

export const HOOK_INTEGRATION_LINE = 'task hook run "$1" "$2" || true';

export class HookConflictError extends TaskCliError {
  readonly hint = `既存フックに次の1行を追加してください: ${HOOK_INTEGRATION_LINE}`;

  constructor(readonly hookPath: string) {
    super(
      `既存の prepare-commit-msg フックがあるため、インストールしませんでした(${hookPath})`
    );
  }
}

export class CorruptedDataError extends TaskCliError {
  readonly hint: string;

  constructor(
    readonly filePath: string,
    detail: string
  ) {
    super(`${filePath} を読み込めません(${detail})`);
    this.hint = `バックアップから復元するには: cp "${filePath}.bak" "${filePath}"`;
  }
}

export class UnsupportedSchemaError extends TaskCliError {
  readonly hint = 'npm install -g taskcli@latest で更新してください';

  constructor(readonly schemaVersion: number) {
    super(
      `このデータは新しいバージョンのTaskCLIで作成されています(schemaVersion: ${schemaVersion})`
    );
  }
}

export class FileSystemError extends TaskCliError {
  readonly hint = 'ディレクトリの書き込み権限と空き容量を確認してください';

  constructor(
    readonly filePath: string,
    readonly code: string
  ) {
    super(`${filePath} にアクセスできません(${code})`);
  }
}
