import { resolve } from 'node:path';
import type { SimpleGit } from 'simple-git';
import { GitOperationError } from '../domain/errors.js';
import type { GitPort } from '../services/ports.js';

const CHECKOUT_HINT =
  '変更をコミットするか git stash で退避してから再実行してください';

/**
 * simple-git をラップし、TaskCLI が必要とする Git 操作のみを公開する。
 * すべての操作は引数配列で git を実行し、シェルを経由しない。
 */
export class GitClient implements GitPort {
  private gitPromise: Promise<SimpleGit> | undefined;

  constructor(private readonly baseDir: string) {}

  async getRepositoryRoot(): Promise<string | undefined> {
    try {
      const output = await this.raw(['rev-parse', '--show-toplevel']);
      return output === '' ? undefined : output;
    } catch {
      // リポジトリ外、または git が未インストール(ENOENT)の場合
      return undefined;
    }
  }

  async getCurrentBranch(): Promise<string | undefined> {
    try {
      const output = await this.raw(['symbolic-ref', '--short', '-q', 'HEAD']);
      return output === '' ? undefined : output;
    } catch {
      // detached HEAD では symbolic-ref が失敗する
      return undefined;
    }
  }

  async branchExists(name: string): Promise<boolean> {
    try {
      const output = await this.raw([
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/heads/${name}`,
      ]);
      return output !== '';
    } catch {
      return false;
    }
  }

  async createAndCheckoutBranch(name: string): Promise<void> {
    await this.runOrThrow(
      ['checkout', '-b', name],
      `ブランチ ${name} を作成できませんでした`,
      CHECKOUT_HINT
    );
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.runOrThrow(
      ['checkout', name],
      `ブランチ ${name} に切り替えられませんでした`,
      CHECKOUT_HINT
    );
  }

  async isValidBranchName(name: string): Promise<boolean> {
    try {
      const output = await this.raw(['check-ref-format', '--branch', name]);
      // @{-1} のような省略記法は別のブランチ名に展開されるため、入力と一致する場合のみ有効とする
      return output === name;
    } catch {
      return false;
    }
  }

  async getHooksDir(): Promise<string> {
    // --git-path は core.hooksPath や worktree を考慮したパスを返す。
    // --path-format=absolute は Git 2.31 以降のため使わず、自前で絶対パス化する
    const output = await this.runOrThrow(
      ['rev-parse', '--git-path', 'hooks'],
      'Gitフックのディレクトリを取得できませんでした',
      'Gitリポジトリが壊れていないか git status で確認してください'
    );
    return resolve(this.baseDir, output);
  }

  private async runOrThrow(
    args: string[],
    message: string,
    hint: string
  ): Promise<string> {
    try {
      return await this.raw(args);
    } catch (error) {
      throw new GitOperationError(
        message,
        error instanceof Error ? error.message.trim() : String(error),
        hint
      );
    }
  }

  private async raw(args: string[]): Promise<string> {
    const git = await this.getGit();
    const output = await git.raw(args);
    return output.trim();
  }

  private getGit(): Promise<SimpleGit> {
    // 起動時間を抑えるため、Git操作が必要になった時点で読み込む
    this.gitPromise ??= import('simple-git').then(({ simpleGit }) =>
      simpleGit({ baseDir: this.baseDir })
    );
    return this.gitPromise;
  }
}
