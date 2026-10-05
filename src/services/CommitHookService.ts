import { join } from 'node:path';
import {
  HOOK_INTEGRATION_LINE,
  HookConflictError,
  NotGitRepositoryError,
} from '../domain/errors.js';
import { appendTrailer } from './appendTrailer.js';
import type { GitPort, TextFilePort } from './ports.js';
import type { TaskService } from './TaskService.js';

export const HOOK_FILE_NAME = 'prepare-commit-msg';
export const HOOK_MARKER = '# managed-by: taskcli';

export const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER} (このコメントを削除するとTaskCLIの管理対象外になります)
command -v task >/dev/null 2>&1 || exit 0
${HOOK_INTEGRATION_LINE}
`;

/**
 * prepare-commit-msg の第2引数のうち、トレーラーを追記しないもの。
 * merge / squash は git が生成するメッセージ、commit は --amend や -c による既存コミットの再利用。
 */
const SKIPPED_SOURCES = new Set(['merge', 'squash', 'commit']);

export type InstallResult = 'installed' | 'already_installed';
export type UninstallResult = 'uninstalled' | 'not_installed' | 'not_owned';

export interface CommitHookServiceDependencies {
  git: GitPort;
  files: TextFilePort;
  taskService: Pick<TaskService, 'findTaskByBranch'>;
  isGitRepository: boolean;
}

/**
 * prepare-commit-msg フックの導入・削除と、コミットメッセージへのトレーラー追記を行う。
 */
export class CommitHookService {
  constructor(private readonly deps: CommitHookServiceDependencies) {}

  /**
   * @throws {NotGitRepositoryError} Gitリポジトリ外の場合
   * @throws {HookConflictError} TaskCLI 以外が作成したフックが存在する場合
   */
  async install(): Promise<InstallResult> {
    const hookPath = await this.getHookPath();
    const existing = await this.deps.files.read(hookPath);
    if (existing === undefined) {
      await this.deps.files.write(hookPath, HOOK_SCRIPT, { executable: true });
      return 'installed';
    }
    if (existing.includes(HOOK_MARKER)) {
      return 'already_installed';
    }
    throw new HookConflictError(hookPath);
  }

  /**
   * TaskCLI が作成したフックのみを削除する。
   *
   * @throws {NotGitRepositoryError} Gitリポジトリ外の場合
   */
  async uninstall(): Promise<UninstallResult> {
    const hookPath = await this.getHookPath();
    const existing = await this.deps.files.read(hookPath);
    if (existing === undefined) {
      return 'not_installed';
    }
    if (!existing.includes(HOOK_MARKER)) {
      return 'not_owned';
    }
    await this.deps.files.remove(hookPath);
    return 'uninstalled';
  }

  /**
   * 現在のブランチに紐付くタスクがあれば、コミットメッセージに `Task: #<id>` を追記する。
   *
   * @param messageFile - git が渡すコミットメッセージのファイルパス
   * @param source - git が渡すメッセージの出所(message / template / merge / squash / commit)
   * @returns 追記したタスクのID。追記しなかった場合は undefined
   */
  async appendTaskTrailer(
    messageFile: string,
    source?: string
  ): Promise<number | undefined> {
    if (source !== undefined && SKIPPED_SOURCES.has(source)) {
      return undefined;
    }
    const branch = await this.deps.git.getCurrentBranch();
    if (branch === undefined) {
      return undefined;
    }
    const task = await this.deps.taskService.findTaskByBranch(branch);
    if (task === undefined) {
      return undefined;
    }

    const message = await this.deps.files.read(messageFile);
    if (message === undefined) {
      return undefined;
    }
    const updated = appendTrailer(message, task.id);
    if (updated === message) {
      return undefined;
    }
    await this.deps.files.write(messageFile, updated);
    return task.id;
  }

  private async getHookPath(): Promise<string> {
    if (!this.deps.isGitRepository) {
      throw new NotGitRepositoryError();
    }
    return join(await this.deps.git.getHooksDir(), HOOK_FILE_NAME);
  }
}
