import type { TaskStore } from '../domain/Task.js';

/**
 * タスクストアの読み書き。
 */
export interface TaskRepositoryPort {
  /** ファイルが存在しなければ空のストアを返す */
  load(): Promise<TaskStore>;
  save(store: TaskStore): Promise<void>;
  initialize(): Promise<'created' | 'already_exists'>;
}

/**
 * TaskCLI が必要とする Git 操作。
 */
export interface GitPort {
  /** detached HEAD やリポジトリ外では undefined */
  getCurrentBranch(): Promise<string | undefined>;
  branchExists(name: string): Promise<boolean>;
  createAndCheckoutBranch(name: string): Promise<void>;
  checkoutBranch(name: string): Promise<void>;
  isValidBranchName(name: string): Promise<boolean>;
  getHooksDir(): Promise<string>;
}

/**
 * フックスクリプトやコミットメッセージなど、テキストファイルの読み書き。
 */
export interface TextFilePort {
  /** ファイルが存在しなければ undefined */
  read(path: string): Promise<string | undefined>;
  write(
    path: string,
    content: string,
    options?: { executable?: boolean }
  ): Promise<void>;
  remove(path: string): Promise<void>;
}
